from sqlalchemy import or_
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import uuid
import httpx
import re
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import func
import jwt

from .database import get_db, create_tables, User as DBUser, Loan as DBLoan, PointsLedger as DBPointsLedger, Transaction as DBTransaction, Membership as DBMembership, UserMembership as DBUserMembership

try:
    import stripe
except Exception:
    stripe = None

from .config import PAYMENT_PROCESSOR, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPPORTED_CURRENCIES, SIGNING_SECRET, ADMIN_EMAIL

if PAYMENT_PROCESSOR == "stripe" and STRIPE_SECRET_KEY and stripe is not None:
    try:
        stripe.api_key = STRIPE_SECRET_KEY
    except Exception:
        pass

app = FastAPI(title="PushFundz Crypto Lending Platform", version="1.0.0")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.on_event("startup")
def startup_event():
    create_tables()
    db = next(get_db())
    try:
        if db.query(DBMembership).count() == 0:
            tiers = [
                {"code": "starter", "name": "Starter", "price": 5.0, "currency": "USD", "loan_limit_usd": 100.0, "first_loan_interest_free": True, "benefits": "Basic access; first loan interest-free"},
                {"code": "standard", "name": "Standard", "price": 15.0, "currency": "USD", "loan_limit_usd": 300.0, "first_loan_interest_free": False, "benefits": "Higher limits"},
                {"code": "premium", "name": "Premium", "price": 30.0, "currency": "USD", "loan_limit_usd": 1000.0, "first_loan_interest_free": False, "benefits": "Highest limits and perks"},
            ]
            for t in tiers:
                db.add(DBMembership(**t))
            db.commit()
    finally:

        db.close()

class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
class MembershipOut(BaseModel):
    code: str
    name: str
    price: float
    currency: str
    loan_limit_usd: float
    first_loan_interest_free: bool
    benefits: Optional[str] = None

class User(BaseModel):
    id: str
    name: str
    email: str
    wallet_address: str
    credit_score: int = 600
    created_at: datetime
    total_loans: int = 0
    successful_repayments: int = 0

class LoanRequest(BaseModel):
    amount_usd: float
    duration_days: int
    collateral_crypto: str
    collateral_amount: float
    purpose: str

class Loan(BaseModel):
    id: str
    user_id: str
    amount_usd: float
    duration_days: int
    interest_rate: float
    collateral_requirement_percent: int
    collateral_crypto: str
    collateral_amount: float
    purpose: str
    status: LoanStatus
    created_at: datetime
    due_date: datetime
    repaid_at: Optional[datetime] = None

class UserRegistration(BaseModel):
    name: str
    email: str
    wallet_address: Optional[str] = None
    
    @validator('wallet_address')
    def validate_wallet_address(cls, v):
        if v is None:
            return v
        
        if re.match(r'^0x[a-fA-F0-9]{40}$', v):
            return v
        if re.match(r'^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$', v) or re.match(r'^bc1[a-z0-9]{39,59}$', v):
            return v
        if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', v):
            return v
            
        raise ValueError('Invalid wallet address format')

class UserLogin(BaseModel):
    email: Optional[str] = None
    wallet_address: Optional[str] = None

class MembershipPurchase(BaseModel):
    membership_code: str
    currency: str = "USD"
    email: Optional[str] = None
    wallet_address: Optional[str] = None

class PaymentRequest(BaseModel):
    loan_id: str
    payment_method: str
    local_currency: str
    amount_local: float

class RPBundlePurchase(BaseModel):
    bundle_size: str  # "small", "medium", "large"
    payment_method: str
    crypto_amount: float
    crypto_currency: str

RP_BUNDLES = {
    "small": {"rp": 100, "price_usd": 5},
    "medium": {"rp": 250, "price_usd": 10},
    "large": {"rp": 600, "price_usd": 20}
}

def calculate_loan_terms(credit_score: int, amount_usd: float):
    """Calculate interest rate and collateral requirement based on credit score"""
    base_interest_rate = 12.0  # 12% annual
    base_collateral_percent = 200  # 200% collateral
    
    if credit_score >= 800:
        interest_rate = base_interest_rate - 2.0  # 10%
        collateral_percent = 150  # 150% collateral
    elif credit_score >= 600:
        interest_rate = base_interest_rate  # 12%
        collateral_percent = base_collateral_percent  # 200%
    else:
        interest_rate = base_interest_rate + 2.0  # 14%
        collateral_percent = 250  # 250% collateral
    
    return interest_rate, collateral_percent

def update_credit_score(user_id: str, loan_repaid: bool, days_late: int = 0, db: Session = None):
    """Update user credit score based on loan performance"""
    if not db:
        return
    
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        return
    
    if loan_repaid:
        if days_late == 0:
            user.credit_score = min(850, user.credit_score + 50)
        elif days_late <= 7:
            user.credit_score = min(850, user.credit_score + 25)
        else:
            user.credit_score = max(300, user.credit_score - 25)
    else:
        user.credit_score = max(300, user.credit_score - 100)
    
    db.commit()

def get_active_membership(db: Session, user_id: uuid.UUID) -> Optional[DBUserMembership]:
    now = datetime.utcnow()
    return db.query(DBUserMembership)\
        .filter(DBUserMembership.user_id == user_id, DBUserMembership.status == "active")\
        .filter((DBUserMembership.expires_at == None) | (DBUserMembership.expires_at > now))\
        .order_by(DBUserMembership.started_at.desc()).first()

@app.get("/payments/success")
def payments_success():
    return {"status": "success"}

@app.get("/payments/cancel")
def payments_cancel():
    return {"status": "canceled"}

class PaymentCheckout(BaseModel):
    purpose: str
    amount: float
    currency: str
    meta: Optional[Dict] = None

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/api/users/register")
async def register_user(user_data: UserRegistration, db: Session = Depends(get_db)):
    """Register a new user"""
    existing_user = db.query(DBUser).filter(DBUser.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if user_data.wallet_address:
        existing_wallet = db.query(DBUser).filter(DBUser.wallet_address == user_data.wallet_address).first()
        if existing_wallet:
            raise HTTPException(status_code=400, detail="Wallet address already registered")
    
    new_user = DBUser(
        name=user_data.name,
        email=user_data.email,
        wallet_address=user_data.wallet_address,
        credit_score=600,
        fiat_balance=0.0,
        tier=0
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"user_id": str(new_user.id), "message": "User registered successfully", "credit_score": 600}

@app.post("/api/auth/login")
def login_user(payload: UserLogin, db: Session = Depends(get_db)):
    if not payload.email:
        raise HTTPException(status_code=400, detail="Email required")
    user = db.query(DBUser).filter(DBUser.email == payload.email).first()
    if not user:
        user = DBUser(email=payload.email, name=payload.email.split("@")[0], wallet_address=None)
        db.add(user)
        db.commit()
        db.refresh(user)
    if ADMIN_EMAIL and payload.email.lower() == ADMIN_EMAIL.lower():
        user.role = "admin"
        db.commit()
    role = user.role or "user"
    if not SIGNING_SECRET:
        raise HTTPException(status_code=500, detail="Auth not configured")
    token = jwt.encode({"sub": str(user.id), "email": user.email, "role": role, "iat": int(datetime.utcnow().timestamp())}, SIGNING_SECRET, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "user_id": str(user.id), "role": role}


@app.get("/api/memberships", response_model=List[MembershipOut])
async def list_memberships(db: Session = Depends(get_db)):
    tiers = db.query(DBMembership).all()
    return [
        MembershipOut(
            code=t.code,
            name=t.name,
            price=t.price,
            currency=t.currency,
            loan_limit_usd=t.loan_limit_usd,
            first_loan_interest_free=t.first_loan_interest_free,
            benefits=t.benefits
        ) for t in tiers
    ]




@app.get("/api/users/{user_id}")
async def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_loans = db.query(DBLoan).filter(DBLoan.user_id == uuid.UUID(user_id)).all()
    return {
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "wallet_address": user.wallet_address,
            "credit_score": user.credit_score,
            "fiat_balance": user.fiat_balance,
            "tier": user.tier,
            "created_at": user.created_at
        },
        "loans": [{
            "id": str(loan.id),
            "amount": loan.loan_amount,
            "status": loan.status,
            "created_at": loan.created_at,
            "due_date": loan.due_date
        } for loan in user_loans],
        "loan_count": len(user_loans)
    }
@app.get("/api/users/{user_id}/membership")
async def get_user_membership(user_id: str, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    um = db.query(DBUserMembership).filter(
        DBUserMembership.user_id == uuid.UUID(user_id),
        DBUserMembership.status == "active",
        or_(DBUserMembership.expires_at.is_(None), DBUserMembership.expires_at > datetime.utcnow())
    ).order_by(DBUserMembership.started_at.desc()).first()
    if not um:
        return {"active": False}
    tier = db.query(DBMembership).filter(DBMembership.id == um.membership_id).first()
    return {
        "active": True,
        "tier": {
            "code": tier.code if tier else None,
            "name": tier.name if tier else None,
            "loan_limit_usd": tier.loan_limit_usd if tier else None,
        },
        "expires_at": um.expires_at
    }

def require_admin(request: Request, db: Session = Depends(get_db)):
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, SIGNING_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return claims

@app.post("/api/loans/request")
async def request_loan(loan_request: LoanRequest, user_id: str, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    active = get_active_membership(db, user.id)
    if not active:
        raise HTTPException(status_code=403, detail="Active membership required to request a loan")
    tier = db.query(DBMembership).filter(DBMembership.id == active.membership_id).first()
    if tier and loan_request.amount_usd > tier.loan_limit_usd:
        raise HTTPException(status_code=400, detail=f"Amount exceeds membership limit of ${tier.loan_limit_usd}")

    interest_rate, collateral_percent = calculate_loan_terms(user.credit_score, loan_request.amount_usd)
    
    active_loans = db.query(DBLoan).filter(
        DBLoan.user_id == uuid.UUID(user_id),
        DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
    ).all()
    
    if len(active_loans) >= 3:  # Limit to 3 active loans
        raise HTTPException(status_code=400, detail="Maximum active loans reached")
    
    due_date = datetime.utcnow() + timedelta(days=loan_request.duration_days)
    
    new_loan = DBLoan(
        user_id=uuid.UUID(user_id),
        amount=loan_request.amount_usd,
        collateral_amount=loan_request.collateral_amount,
        collateral_asset=loan_request.collateral_crypto,
        loan_amount=loan_request.amount_usd,
        loan_asset="USDC",
        interest_rate=interest_rate,
        duration_days=loan_request.duration_days,
        status=LoanStatus.PENDING,
        due_date=due_date
    )
    
    db.add(new_loan)
    db.commit()
    db.refresh(new_loan)
    
    return {
        "loan_id": str(new_loan.id),
        "message": "Loan request submitted",
        "interest_rate": interest_rate,
        "collateral_requirement": f"{collateral_percent}%",
        "due_date": due_date.isoformat()
    }
from .config import PAYMENT_PROCESSOR, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPPORTED_CURRENCIES, SIGNING_SECRET, ADMIN_EMAIL, MERCHANT_WALLET_SOL, MERCHANT_WALLET_SOL_NETWORK, MERCHANT_WALLET_ETH, MERCHANT_WALLET_ETH_NETWORK
try:
    import stripe  # type: ignore
except Exception:
    stripe = None

@app.get("/api/loans/{loan_id}")
async def get_loan(loan_id: str, db: Session = Depends(get_db)):
    """Get loan details"""
    loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    return {
        "id": str(loan.id),
        "user_id": str(loan.user_id),
        "amount_usd": loan.loan_amount,
        "duration_days": loan.duration_days,
        "interest_rate": loan.interest_rate,
        "collateral_crypto": loan.collateral_asset,
        "collateral_amount": loan.collateral_amount,
        "status": loan.status,
        "created_at": loan.created_at,
        "due_date": loan.due_date,
        "repaid_at": loan.repaid_at
    }

@app.post("/api/loans/{loan_id}/approve")
async def approve_loan(loan_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Approve a pending loan (admin function)"""
    loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status != LoanStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Loan is not pending approval")
    
    loan.status = LoanStatus.APPROVED.value
    loan.approved_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Loan approved successfully"}

@app.post("/api/memberships/purchase")
async def purchase_membership(user_id: str, body: MembershipPurchase, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tier = db.query(DBMembership).filter(DBMembership.code == body.membership_code).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Membership not found")
    checkout_body = {
        "purpose": "membership",
        "amount": tier.price,
        "currency": tier.currency.upper(),
        "meta": {"user_id": str(user.id), "membership_code": tier.code},
    }
    return create_checkout_session(checkout_body)
def create_checkout_session(body: Dict):
    if PAYMENT_PROCESSOR != "stripe":
        raise HTTPException(status_code=400, detail="Stripe not configured")
    if "USD" not in (SUPPORTED_CURRENCIES or ["USD"]):
        raise HTTPException(status_code=400, detail="Unsupported currency")
    purpose = body.get("purpose")
    amount = float(body.get("amount", 0))
    currency = (body.get("currency") or "USD").upper()
    meta = body.get("meta") or {}
    user_id = meta.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required in meta")
    cents = int(round(amount * 100))
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            success_url="https://pushfundz.onrender.com/payments/success",
            cancel_url="https://pushfundz.onrender.com/payments/cancel",
            line_items=[
                {
                    "price_data": {
                        "currency": currency.lower(),
                        "product_data": {"name": f"{purpose}".replace("_", " ").title()},
                        "unit_amount": cents,
                    },
                    "quantity": 1,
                }
            ],
            metadata={
                "purpose": purpose,
                "user_id": user_id,
                "membership_code": meta.get("membership_code") or "",
                "loan_id": meta.get("loan_id") or "",
                "rp_bundle": meta.get("rp_bundle") or "",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    db = next(get_db())
    try:
        tx = DBTransaction(
            user_id=uuid.UUID(user_id),
            amount=amount,
            currency=currency,
            status="pending",
            external_tx_id=session.id,
            purpose=purpose,
            created_at=datetime.utcnow(),
        )
        db.add(tx)
        db.commit()
        return {"checkout_url": session.url, "transaction_id": str(tx.id)}
    finally:
        db.close()

@app.post("/api/payments/checkout")
async def payments_checkout(body: PaymentCheckout):
    return create_checkout_session(body.model_dump())


@app.post("/api/payments/process")
async def process_payment(payment: PaymentRequest):
    raise HTTPException(status_code=410, detail="Deprecated. Use /api/payments/checkout")

@app.post("/api/payments/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if PAYMENT_PROCESSOR != "stripe":
        return {"status": "ignored"}
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if stripe is None or not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig_header, secret=STRIPE_WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    if event["type"] in ("checkout.session.completed", "payment_intent.succeeded"):
        metadata = {}
        ext_id = None
        if event["type"] == "checkout.session.completed":
            session_obj = event["data"]["object"]
            metadata = session_obj.get("metadata") or {}
            ext_id = session_obj.get("id")
        else:
            pi = event["data"]["object"]
            metadata = pi.get("metadata") or {}
            ext_id = pi.get("id")

        if ext_id:
            txn = db.query(DBTransaction).filter(DBTransaction.external_tx_id == ext_id).first()
            if txn:
                txn.status = "completed"
                txn.completed_at = datetime.utcnow()
                db.commit()
                if metadata.get("purpose") == "membership":
                    user_id = metadata.get("user_id")
                    code = metadata.get("membership_code")
                    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first() if user_id else None
                    tier = db.query(DBMembership).filter(DBMembership.code == code).first() if code else None
                    if user and tier:
                        um = DBUserMembership(
                            user_id=user.id,
                            membership_id=tier.id,
                            status="active",
                            started_at=datetime.utcnow(),
                            expires_at=datetime.utcnow() + timedelta(days=30)
                        )
                        db.add(um)
                        db.commit()
    return {"received": True}

@app.post("/api/loans/{loan_id}/repay")
async def repay_loan(loan_id: str, db: Session = Depends(get_db)):
    """Repay a loan"""
    loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status != LoanStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Loan is not active")
    
    now = datetime.utcnow()
    due_date = loan.due_date
    days_late = max(0, (now - due_date).days) if due_date else 0
    
    loan.status = LoanStatus.REPAID.value
    loan.repaid_at = now
    
    update_credit_score(str(loan.user_id), True, days_late, db)
    
    user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
    
    return {
        "message": "Loan repaid successfully",
        "days_late": days_late,
        "new_credit_score": user.credit_score if user else None
    }

@app.get("/api/users/{user_id}/loans")
async def get_user_loans(user_id: str, db: Session = Depends(get_db)):
    """Get all loans for a user"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_loans = db.query(DBLoan).filter(DBLoan.user_id == uuid.UUID(user_id)).all()
    
    return {
        "loans": [{
            "id": str(loan.id),
            "amount_usd": loan.loan_amount,
            "status": loan.status,
            "created_at": loan.created_at,
            "due_date": loan.due_date,
            "repaid_at": loan.repaid_at,
            "interest_rate": loan.interest_rate,
            "collateral_crypto": loan.collateral_asset,
            "collateral_amount": loan.collateral_amount
        } for loan in user_loans]
    }

@app.get("/api/stats")
async def get_platform_stats(db: Session = Depends(get_db)):
    """Get platform statistics"""
    total_users = db.query(DBUser).count()
    total_loans = db.query(DBLoan).count()
    active_loans = db.query(DBLoan).filter(DBLoan.status == LoanStatus.ACTIVE.value).count()
    total_volume = db.query(func.sum(DBLoan.loan_amount)).scalar() or 0
    
    return {
        "total_users": total_users,
        "total_loans": total_loans,
        "active_loans": active_loans,
        "total_volume_usd": float(total_volume)
    }

@app.post("/api/users/{user_id}/fund-wallet")
async def fund_wallet(user_id: str, funding_data: dict, request: Request, db: Session = Depends(get_db)):
    """Fund user wallet with auto-deduction for outstanding loans"""
    try:
        async with httpx.AsyncClient() as client:
            security_response = await client.post(
                "http://localhost:3007/security/validate-transaction",
                json={
                    "user_id": user_id,
                    "amount": funding_data.get("amount", 0),
                    "transaction_type": "wallet_funding"
                },
                headers={"X-Forwarded-For": request.client.host}
            )
            if security_response.status_code != 200:
                raise HTTPException(status_code=429, detail="Transaction blocked by security system")
    except httpx.RequestError:
        pass  # Continue if security service is unavailable
    
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    funding_amount = funding_data.get("amount", 0)
    currency = funding_data.get("currency", "USD")
    
    outstanding_amount = abs(user.fiat_balance) if user.fiat_balance < 0 else 0
    
    if outstanding_amount > 0:
        if funding_amount >= outstanding_amount:
            remaining_funds = funding_amount - outstanding_amount
            new_balance = remaining_funds
            deducted_amount = outstanding_amount
        else:
            new_balance = user.fiat_balance + funding_amount  # Still negative
            deducted_amount = funding_amount
    else:
        new_balance = user.fiat_balance + funding_amount
        deducted_amount = 0
    
    user.fiat_balance = new_balance
    
    new_transaction = DBTransaction(
        user_id=uuid.UUID(user_id),
        transaction_type="wallet_funding",
        amount=funding_amount,
        currency=currency,
        status="completed"
    )
    
    db.add(new_transaction)
    db.commit()
    
    return {
        "message": "Wallet funded successfully",
        "funding_amount": funding_amount,
        "auto_deducted": deducted_amount,
        "new_balance": new_balance,
        "outstanding_cleared": deducted_amount == outstanding_amount and outstanding_amount > 0
    }

@app.post("/api/users/{user_id}/buy-rp")
async def buy_rp_bundle(user_id: str, purchase_data: RPBundlePurchase, request: Request, db: Session = Depends(get_db)):
    """Purchase RP bundle with crypto"""
    try:
        async with httpx.AsyncClient() as client:
            security_response = await client.post(
                "http://localhost:3007/security/validate-transaction",
                json={
                    "user_id": user_id,
                    "amount": purchase_data.crypto_amount,
                    "transaction_type": "rp_purchase"
                },
                headers={"X-Forwarded-For": request.client.host}
            )
            if security_response.status_code != 200:
                raise HTTPException(status_code=429, detail="Purchase blocked by security system")
    except httpx.RequestError:
        pass  # Continue if security service is unavailable
    
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if purchase_data.bundle_size not in RP_BUNDLES:
        raise HTTPException(status_code=400, detail="Invalid bundle size")
    
    bundle = RP_BUNDLES[purchase_data.bundle_size]
    
    new_transaction = DBTransaction(
        user_id=uuid.UUID(user_id),
        transaction_type="rp_purchase",
        amount=purchase_data.crypto_amount,
        currency=purchase_data.crypto_currency,
        status="completed"
    )
    
    new_points = DBPointsLedger(
        user_id=uuid.UUID(user_id),
        event_type="RP_PURCHASE",
        points_delta=bundle["rp"],
        description=f"Purchased {purchase_data.bundle_size} RP bundle"
    )
    
    db.add(new_transaction)
    db.add(new_points)
    db.commit()
    
    return {
        "message": "RP bundle purchased successfully",
        "rp_awarded": bundle["rp"],
        "bundle_size": purchase_data.bundle_size,
        "transaction_id": str(new_transaction.id)
    }

@app.get("/api/admin/negative-balances")
async def get_negative_balance_users(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Get users with negative balances for admin monitoring"""
    negative_users = db.query(DBUser).filter(DBUser.fiat_balance < 0).all()
    
    users_data = []
    total_outstanding = 0
    
    for user in negative_users:
        active_loans = db.query(DBLoan).filter(
            DBLoan.user_id == user.id,
            DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
        ).count()
        
        users_data.append({
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "fiat_balance": user.fiat_balance,
            "credit_score": user.credit_score,
            "active_loans": active_loans
        })
        
        total_outstanding += abs(user.fiat_balance)
    
    stats = {
        "totalNegativeUsers": len(negative_users),
        "totalOutstandingAmount": total_outstanding,
        "averageNegativeBalance": total_outstanding / len(negative_users) if negative_users else 0
    }
    
    return {
        "users": users_data,
        "stats": stats
    }

# Game endpoints
import random
from datetime import datetime, timedelta

class GameRequest(BaseModel):
    user_id: str

class RPSRequest(BaseModel):
    user_id: str
    choice: str  # "rock", "paper", "scissors"

class SpinRequest(BaseModel):
    user_id: str
    rp_stake: int = 50

def get_user_rp_balance(user_id: str, db: Session) -> int:
    """Get user's current RP balance"""
    total_points = db.query(func.sum(DBPointsLedger.points_delta)).filter(
        DBPointsLedger.user_id == uuid.UUID(user_id)
    ).scalar() or 0
    return int(total_points)

def add_rp_to_user(user_id: str, amount: int, event_type: str, description: str, db: Session):
    """Add RP points to user"""
    new_points = DBPointsLedger(
        user_id=uuid.UUID(user_id),
        event_type=event_type,
        points_delta=amount,
        description=description
    )
    db.add(new_points)
    db.commit()

def can_claim_daily_rp(user_id: str, db: Session) -> bool:
    """Check if user can claim daily RP (once per day)"""
    today = datetime.utcnow().date()
    last_claim = db.query(DBPointsLedger).filter(
        DBPointsLedger.user_id == uuid.UUID(user_id),
        DBPointsLedger.event_type == "DAILY_DRIP",
        func.date(DBPointsLedger.event_timestamp) == today
    ).first()
    return last_claim is None

@app.post("/api/games/daily-drip")
async def claim_daily_rp(request: GameRequest, db: Session = Depends(get_db)):
    """Claim daily RP drip"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not can_claim_daily_rp(request.user_id, db):
        raise HTTPException(status_code=400, detail="Daily RP already claimed today")
    
    # Award 25-50 RP randomly
    rp_awarded = random.randint(25, 50)
    add_rp_to_user(request.user_id, rp_awarded, "DAILY_DRIP", "Daily RP claim", db)
    
    return {
        "message": "Daily RP claimed successfully!",
        "rpAwarded": rp_awarded
    }

@app.post("/api/games/rps")
async def play_rock_paper_scissors(request: RPSRequest, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current_rp = get_user_rp_balance(request.user_id, db)
    if current_rp < 10:
        raise HTTPException(status_code=400, detail="Insufficient RP balance (minimum 10 RP required)")
    choices = ["rock", "paper", "scissors"]
    if request.choice.lower() not in choices:
        raise HTTPException(status_code=400, detail="Invalid choice. Must be rock, paper, or scissors")
    player_choice = request.choice.lower()
    roll = random.randint(1, 100)
    if roll <= 60:
        if player_choice == "rock":
            computer_choice = "paper"
        elif player_choice == "paper":
            computer_choice = "scissors"
        else:
            computer_choice = "rock"
        result = "You lose"
        rp_won = -10
    elif roll <= 90:
        computer_choice = player_choice
        result = "Tie"
        rp_won = 0
    else:
        if player_choice == "rock":
            computer_choice = "scissors"
        elif player_choice == "paper":
            computer_choice = "rock"
        else:
            computer_choice = "paper"
        result = "You win"
        rp_won = 20
    if rp_won != 0:
        add_rp_to_user(request.user_id, rp_won, "RPS_GAME", f"RPS: {result}", db)
    new_balance = get_user_rp_balance(request.user_id, db)
    return {
        "player_choice": player_choice,
        "computer_choice": computer_choice,
        "result": result,
        "rp_won": rp_won,
        "new_rp_balance": new_balance
    }

@app.post("/api/games/spin")
async def play_spin_wheel(request: SpinRequest, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current_rp = get_user_rp_balance(request.user_id, db)
    if current_rp < request.rp_stake:
        raise HTTPException(status_code=400, detail="Insufficient RP balance")
    add_rp_to_user(request.user_id, -request.rp_stake, "SPIN_STAKE", f"Spin wheel stake: {request.rp_stake} RP", db)
    spin_results = [
        {"result": "Nothing", "multiplier": 0, "probability": 55},
        {"result": "Small Win", "multiplier": 1.25, "probability": 28},
        {"result": "Big Win", "multiplier": 1.75, "probability": 14},
        {"result": "Jackpot", "multiplier": 3.0, "probability": 3}
    ]
    rand = random.randint(1, 100)
    cumulative = 0
    selected_result = spin_results[0]
    for result in spin_results:
        cumulative += result["probability"]
        if rand <= cumulative:
            selected_result = result
            break
    rp_won = int(request.rp_stake * selected_result["multiplier"])
    if rp_won > 0:
        add_rp_to_user(request.user_id, rp_won, "SPIN_WIN", f"Spin wheel win: {selected_result['result']}", db)
    new_balance = get_user_rp_balance(request.user_id, db)
    return {
        "result": selected_result["result"],
        "rp_won": rp_won,
        "new_rp_balance": new_balance
    }

@app.post("/api/games/whot")
async def play_whot_game(request: GameRequest, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current_rp = get_user_rp_balance(request.user_id, db)
    if current_rp < 15:
        raise HTTPException(status_code=400, detail="Insufficient RP balance (minimum 15 RP required)")
    player_wins = random.random() < 0.12
    if player_wins:
        result = "You win"
        rp_won = 30
        message = "Great game! You defeated the CPU!"
    else:
        result = "CPU wins"
        rp_won = -15
        message = "Better luck next time!"
    add_rp_to_user(request.user_id, rp_won, "WHOT_GAME", f"Whot game: {result}", db)
    new_balance = get_user_rp_balance(request.user_id, db)
    return {
        "result": result,
        "rp_won": rp_won,
        "new_rp_balance": new_balance,
        "message": message
    }

# Points system endpoint
@app.get("/api/points/user/{user_id}/points")
async def get_user_points(user_id: str, db: Session = Depends(get_db)):
    """Get user points data and tier information"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate total points
    total_points = db.query(func.sum(DBPointsLedger.points_delta)).filter(
        DBPointsLedger.user_id == uuid.UUID(user_id)
    ).scalar() or 0
    
    # Define tier thresholds
    tier_thresholds = {
        "BRONZE": 0,
        "SILVER": 500,
        "GOLD": 1500,
        "PLATINUM": 5000
    }
    
    # Determine current tier
    current_tier = "BRONZE"
    for tier, threshold in tier_thresholds.items():
        if total_points >= threshold:
            current_tier = tier
    
    # Get recent history
    recent_history = db.query(DBPointsLedger).filter(
        DBPointsLedger.user_id == uuid.UUID(user_id)
    ).order_by(DBPointsLedger.event_timestamp.desc()).limit(10).all()
    
    history_data = [{
        "id": entry.id,
        "event_type": entry.event_type,
        "points_delta": entry.points_delta,
        "description": entry.description,
        "event_timestamp": entry.event_timestamp.isoformat()
    } for entry in recent_history]
    
    return {
        "totalPoints": int(total_points),
        "tier": current_tier,
        "tierThresholds": tier_thresholds,
        "recentHistory": history_data
    }

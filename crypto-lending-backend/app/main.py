from fastapi import FastAPI, HTTPException, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime, timedelta
import uuid
import httpx
import re
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import func
from .database import get_db, create_tables, User as DBUser, Loan as DBLoan, PointsLedger as DBPointsLedger, Transaction as DBTransaction, Membership, ReferralCode

app = FastAPI(title="PushFundz Crypto Lending Platform", version="1.0.0")

@app.middleware("http")
async def tunnel_auth_middleware(request: Request, call_next):
    response = await call_next(request)
    
    if request.headers.get("host", "").endswith(".devinapps.com"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

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

class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    ACTIVE = "active"
    REPAID = "repaid"
    DEFAULTED = "defaulted"

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

class PaymentRequest(BaseModel):
    loan_id: str
    payment_method: str
    local_currency: str
    amount_local: float

class MembershipPurchase(BaseModel):
    tier: str

class MembershipUpgrade(BaseModel):
    tier: str

class LoanRequestV2(BaseModel):
    amount: float
    currency: str
    duration_days: int
    collateral_crypto: str
    collateral_amount: float
    purpose: str

class ReferralRegistration(BaseModel):
    name: str
    email: str
    referral_code: str = None

class LoanRequestV2(BaseModel):
    amount: float
    currency: str  # 'USD' or 'NGN'
    duration_days: int = 30
    collateral_crypto: str = "BTC"
    collateral_amount: float
    purpose: str = ""

class ReferralRegistration(BaseModel):
    name: str
    email: str
    wallet_address: str = ""
    referral_code: str = ""

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
            user.credit_score = min(850, user.credit_score + 50)  # Timely repayment
        elif days_late <= 7:
            user.credit_score = min(850, user.credit_score + 25)  # Slightly late
        else:
            user.credit_score = max(300, user.credit_score - 25)  # Late repayment
    else:
        user.credit_score = max(300, user.credit_score - 100)  # Default
    
    db.commit()

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

@app.post("/api/users/login")
async def login_user(login_data: UserLogin, db: Session = Depends(get_db)):
    """Login user with email or wallet address"""
    if not login_data.email and not login_data.wallet_address:
        raise HTTPException(status_code=400, detail="Email or wallet address required")
    
    user = None
    if login_data.email:
        user = db.query(DBUser).filter(DBUser.email == login_data.email).first()
    elif login_data.wallet_address:
        user = db.query(DBUser).filter(DBUser.wallet_address == login_data.wallet_address).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_loans = db.query(DBLoan).filter(DBLoan.user_id == user.id).all()
    
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
        "message": "Login successful"
    }

@app.get("/api/users/{user_id}")
async def get_user(user_id: str, db: Session = Depends(get_db)):
    """Get user profile"""
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

@app.post("/api/loans/request")
async def request_loan(loan_request: LoanRequest, user_id: str, db: Session = Depends(get_db)):
    """Request a new loan - requires active membership"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check membership and validate loan amount
    membership = db.query(Membership).filter(
        Membership.user_id == uuid.UUID(user_id),
        Membership.is_active == True
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=403, 
            detail="Membership required. Please purchase a membership to access loans."
        )
    
    tier_limits = {
        'starter': 25,
        'standard': 100,
        'premium': 500
    }
    
    max_loan_usd = tier_limits.get(membership.tier, 0)
    
    if loan_request.amount_usd > max_loan_usd:
        raise HTTPException(
            status_code=400, 
            detail=f"Loan amount exceeds your {membership.tier} tier limit of ${max_loan_usd}"
        )
    
    # Calculate interest rate and collateral
    interest_rate, collateral_percent = calculate_loan_terms(user.credit_score, loan_request.amount_usd)
    
    # Apply first loan interest-free benefit
    if not user.first_loan_used:
        interest_rate = 0.0  # First loan is interest-free!
        user.first_loan_used = True
        db.commit()
    
    # Check active loans limit
    active_loans = db.query(DBLoan).filter(
        DBLoan.user_id == uuid.UUID(user_id),
        DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
    ).all()
    
    if len(active_loans) >= 3:
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
        "due_date": due_date.isoformat(),
        "is_interest_free": interest_rate == 0.0,
        "membership_tier": membership.tier,
        "max_loan_amount": max_loan_usd
    }

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
async def approve_loan(loan_id: str, db: Session = Depends(get_db)):
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

@app.post("/api/payments/process")
async def process_payment(payment: PaymentRequest, db: Session = Depends(get_db)):
    """Process loan payment with local currency"""
    loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(payment.loan_id)).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.status != LoanStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="Loan is not approved for payment")
    
    new_transaction = DBTransaction(
        user_id=loan.user_id,
        loan_id=payment.loan_id,
        transaction_type="fiat_deposit",
        amount=payment.amount_local,
        currency=payment.local_currency,
        status="completed"
    )
    
    db.add(new_transaction)
    
    loan.status = LoanStatus.ACTIVE.value
    
    user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
    if user:
        user.fiat_balance -= payment.amount_local  # Make balance negative
    
    db.commit()
    db.refresh(new_transaction)
    
    return {
        "transaction_id": str(new_transaction.id),
        "message": "Payment processed successfully - loan disbursed",
        "loan_status": "active",
        "new_wallet_balance": user.fiat_balance if user else None
    }

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
    db.commit()
    
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
    
@app.post("/api/memberships/purchase")
async def purchase_membership(
    membership_request: MembershipPurchase,
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    existing_membership = db.query(Membership).filter(Membership.user_id == uuid.UUID(user_id), Membership.is_active == True).first()
    if existing_membership:
        raise HTTPException(status_code=400, detail="User already has active membership")
    
    tier_prices = {
        'starter': 5,
        'standard': 10,
        'premium': 30
    }
    
    if membership_request.tier not in tier_prices:
        raise HTTPException(status_code=400, detail="Invalid membership tier")
    
    price = tier_prices[membership_request.tier]
    
    if user.fiat_balance < price:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    user.fiat_balance -= price
    
    membership = Membership(
        user_id=uuid.UUID(user_id),
        tier=membership_request.tier,
        price_paid=price
    )
    
    db.add(membership)
    db.commit()
    db.refresh(membership)
    
    return {
        "membership_id": membership.id,
        "tier": membership.tier,
        "price_paid": price,
        "new_balance": user.fiat_balance
    }

@app.post("/api/memberships/upgrade")
async def upgrade_membership(
    membership_request: MembershipPurchase,
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_membership = db.query(Membership).filter(Membership.user_id == uuid.UUID(user_id), Membership.is_active == True).first()
    if not current_membership:
        raise HTTPException(status_code=400, detail="No active membership found")
    
    tier_hierarchy = {'starter': 1, 'standard': 2, 'premium': 3}
    tier_prices = {'starter': 5, 'standard': 10, 'premium': 30}
    
    current_tier_level = tier_hierarchy.get(current_membership.tier, 0)
    new_tier_level = tier_hierarchy.get(membership_request.tier, 0)
    
    if new_tier_level <= current_tier_level:
        raise HTTPException(status_code=400, detail="Can only upgrade to higher tier")
    
    upgrade_cost = tier_prices[membership_request.tier] - current_membership.price_paid
    
    if user.fiat_balance < upgrade_cost:
        raise HTTPException(status_code=400, detail="Insufficient balance for upgrade")
    
    user.fiat_balance -= upgrade_cost
    current_membership.tier = membership_request.tier
    current_membership.price_paid = tier_prices[membership_request.tier]
    
    db.commit()
    
    return {
        "membership_id": current_membership.id,
        "new_tier": membership_request.tier,
        "upgrade_cost": upgrade_cost,
        "new_balance": user.fiat_balance
    }

@app.get("/api/memberships/{user_id}")
async def get_membership_status(user_id: str, db: Session = Depends(get_db)):
    membership = db.query(Membership).filter(Membership.user_id == uuid.UUID(user_id), Membership.is_active == True).first()
    
    if not membership:
        return {"has_membership": False}
    
    tier_limits = {
        'starter': {'usd': 25, 'ngn': 40000},
        'standard': {'usd': 100, 'ngn': 160000},
        'premium': {'usd': 500, 'ngn': 800000}
    }
    
    return {
        "has_membership": True,
        "tier": membership.tier,
        "price_paid": membership.price_paid,
        "purchase_date": membership.purchase_date,
        "limits": tier_limits.get(membership.tier, {})
    }

@app.post("/api/loans/request-v2")
async def request_loan_v2(
    loan_request: LoanRequestV2,
    user_id: str,
    db: Session = Depends(get_db)
):
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check membership
    membership = db.query(Membership).filter(Membership.user_id == user_id, Membership.is_active == True).first()
    if not membership:
        raise HTTPException(status_code=400, detail="Membership required to request loans")
    
    tier_limits = {
        'starter': {'USD': 25, 'NGN': 40000},
        'standard': {'USD': 100, 'NGN': 160000},
        'premium': {'USD': 500, 'NGN': 800000}
    }
    
    if loan_request.currency not in ['USD', 'NGN']:
        raise HTTPException(status_code=400, detail="Supported currencies: USD, NGN")
    
    limit = tier_limits.get(membership.tier, {}).get(loan_request.currency, 0)
    if loan_request.amount > limit:
        raise HTTPException(
            status_code=400,
            detail=f"Loan amount exceeds {membership.tier} tier limit of {limit} {loan_request.currency}"
        )
    
    usd_amount = loan_request.amount
    if loan_request.currency == 'NGN':
        usd_amount = loan_request.amount / 1600  # Approximate conversion rate
    
    base_rate = 0.15
    credit_factor = max(0, (user.credit_score - 300) / 500)
    interest_rate = base_rate - (credit_factor * 0.10)
    
    # Apply first loan benefit
    if not user.first_loan_used:
        interest_rate = 0.0
        user.first_loan_used = True
        db.commit()
    else:
        interest_rate = max(0.05, min(0.25, interest_rate))
    
    loan = DBLoan(
        user_id=uuid.UUID(user_id),
        amount=loan_request.amount,
        collateral_amount=loan_request.collateral_amount,
        collateral_asset=loan_request.collateral_crypto,
        loan_amount=usd_amount,
        loan_asset=loan_request.currency,
        interest_rate=interest_rate,
        duration_days=loan_request.duration_days,
        status=LoanStatus.PENDING,
        due_date=datetime.utcnow() + timedelta(days=loan_request.duration_days)
    )
    
    db.add(loan)
    db.commit()
    db.refresh(loan)
    
    return {
        "loan_id": str(loan.id),
        "amount": loan_request.amount,
        "currency": loan_request.currency,
        "amount_usd": usd_amount,
        "interest_rate": round(interest_rate * 100, 2),
        "first_loan_benefit": interest_rate == 0.0
    }

@app.post("/api/referrals/generate")
async def generate_referral_code(
    user_id: str,
    db: Session = Depends(get_db)
):
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user already has a referral code
    existing_code = db.query(ReferralCode).filter(ReferralCode.user_id == uuid.UUID(user_id)).first()
    if existing_code:
        return {
            "referral_code": existing_code.code,
            "uses_count": existing_code.uses_count
        }
    
    # Generate unique code
    import random
    import string
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    
    while db.query(ReferralCode).filter(ReferralCode.code == code).first():
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    
    referral_code = ReferralCode(
        user_id=uuid.UUID(user_id),
        code=code
    )
    
    db.add(referral_code)
    db.commit()
    db.refresh(referral_code)
    
    return {
        "referral_code": code,
        "uses_count": 0
    }

@app.post("/api/users/register-with-referral")
async def register_with_referral(user_data: ReferralRegistration, db: Session = Depends(get_db)):
    existing_user = db.query(DBUser).filter(
        (DBUser.email == user_data.email) | 
        (DBUser.wallet_address == user_data.wallet_address)
    ).first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    referrer_id = None
    if user_data.referral_code:
        referral = db.query(ReferralCode).filter(ReferralCode.code == user_data.referral_code).first()
        if not referral:
            raise HTTPException(status_code=400, detail="Invalid referral code")
        referrer_id = referral.user_id
    
    new_user = DBUser(
        name=user_data.name,
        email=user_data.email,
        wallet_address=user_data.wallet_address,
        referred_by=referrer_id
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    if referrer_id:
        referrer_points = DBPointsLedger(
            user_id=referrer_id,
            event_type="referral_bonus",
            points_delta=50,
            description="Referral bonus for new user"
        )
        db.add(referrer_points)
        
        new_user_points = DBPointsLedger(
            user_id=new_user.id,
            event_type="referral_welcome",
            points_delta=25,
            description="Welcome bonus from referral"
        )
        db.add(new_user_points)
        
        referral.uses_count += 1
        
        db.commit()
    
    return {
        "user_id": str(new_user.id),
        "message": "Registration successful",
        "referral_bonus": 25 if referrer_id else 0
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
async def get_negative_balance_users(db: Session = Depends(get_db)):
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

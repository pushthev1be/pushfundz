from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import uuid
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import func
from .database import get_db, create_tables, User as DBUser, Loan as DBLoan, PointsLedger as DBPointsLedger, Transaction as DBTransaction

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
    """Request a new loan"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
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
async def fund_wallet(user_id: str, funding_data: dict, db: Session = Depends(get_db)):
    """Fund user wallet with auto-deduction for outstanding loans"""
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
async def buy_rp_bundle(user_id: str, purchase_data: RPBundlePurchase, db: Session = Depends(get_db)):
    """Purchase RP bundle with crypto"""
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

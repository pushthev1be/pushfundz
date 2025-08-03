from fastapi import FastAPI, HTTPException, Depends, Request
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
from .database import get_db, create_tables, User as DBUser, Loan as DBLoan, PointsLedger as DBPointsLedger, Transaction as DBTransaction, Membership as DBMembership
from .routers import memberships, loans, admin
from .schemas import UserCreate, UserLogin, LoanStatus, StatsResponse
from .config import MEMBERSHIP_TIERS, calculate_loan_terms

app = FastAPI(title="PushFundz Crypto Lending Platform", version="1.0.0")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include routers
app.include_router(memberships.router)
app.include_router(loans.router)
app.include_router(admin.router)

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
async def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
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
    """Play Rock Paper Scissors game"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_rp = get_user_rp_balance(request.user_id, db)
    if current_rp < 10:  # Minimum 10 RP to play
        raise HTTPException(status_code=400, detail="Insufficient RP balance (minimum 10 RP required)")
    
    choices = ["rock", "paper", "scissors"]
    if request.choice.lower() not in choices:
        raise HTTPException(status_code=400, detail="Invalid choice. Must be rock, paper, or scissors")
    
    player_choice = request.choice.lower()
    computer_choice = random.choice(choices)
    
    # Determine winner
    if player_choice == computer_choice:
        result = "Tie"
        rp_won = 0
    elif (player_choice == "rock" and computer_choice == "scissors") or \
         (player_choice == "paper" and computer_choice == "rock") or \
         (player_choice == "scissors" and computer_choice == "paper"):
        result = "You win"
        rp_won = 20
    else:
        result = "You lose"
        rp_won = -10
    
    # Update RP balance
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
    """Play spin wheel game"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_rp = get_user_rp_balance(request.user_id, db)
    if current_rp < request.rp_stake:
        raise HTTPException(status_code=400, detail="Insufficient RP balance")
    
    # Deduct stake
    add_rp_to_user(request.user_id, -request.rp_stake, "SPIN_STAKE", f"Spin wheel stake: {request.rp_stake} RP", db)
    
    # Spin results with probabilities
    spin_results = [
        {"result": "Nothing", "multiplier": 0, "probability": 40},
        {"result": "Small Win", "multiplier": 1.5, "probability": 30},
        {"result": "Big Win", "multiplier": 2.0, "probability": 20},
        {"result": "Jackpot", "multiplier": 5.0, "probability": 10}
    ]
    
    # Weighted random selection
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
    """Play Whot card game against CPU"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(request.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_rp = get_user_rp_balance(request.user_id, db)
    if current_rp < 15:  # Minimum 15 RP to play
        raise HTTPException(status_code=400, detail="Insufficient RP balance (minimum 15 RP required)")
    
    # Simple Whot simulation (60% win rate for player)
    player_wins = random.random() < 0.6
    
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

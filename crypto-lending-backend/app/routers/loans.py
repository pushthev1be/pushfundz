from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import datetime, timedelta
import uuid

from ..database import get_db, User as DBUser, Loan as DBLoan, Membership as DBMembership, LoanRPBenefit
from ..schemas import LoanRequest, LoanResponse, LoanStatus, RPBenefitRequest
from ..auth import get_current_user, get_required_user
from ..config import calculate_loan_terms, get_settings

router = APIRouter(prefix="/api/loans", tags=["loans"])
settings = get_settings()

@router.post("/request")
async def request_loan(
    loan_request: LoanRequest,
    user_id: str,
    db: Session = Depends(get_db)
):
    """Request a new loan"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    membership = db.query(DBMembership).filter(DBMembership.user_id == user.id).first()
    if membership:
        from ..config import MEMBERSHIP_TIERS
        max_loan = MEMBERSHIP_TIERS[membership.tier]["max_loan_usd"]
        if loan_request.amount_usd > max_loan:
            raise HTTPException(
                status_code=400, 
                detail=f"Loan amount exceeds {membership.tier} tier limit of ${max_loan}"
            )
    else:
        if loan_request.amount_usd > 200:
            raise HTTPException(
                status_code=400,
                detail="Please purchase a membership to access higher loan limits"
            )
    
    interest_rate, collateral_percent = calculate_loan_terms(user.credit_score, loan_request.amount_usd)
    
    user_loans = db.query(DBLoan).filter(DBLoan.user_id == user.id).all()
    if not user_loans and membership and not membership.is_first_loan_used:
        interest_rate = 0.0  # First loan is interest-free
        membership.is_first_loan_used = True
    
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
        "due_date": due_date.isoformat(),
        "first_loan_benefit": interest_rate == 0.0
    }

@router.get("/{loan_id}")
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

@router.post("/{loan_id}/repay")
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
    
    user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
    if user:
        if days_late == 0:
            user.credit_score = min(850, user.credit_score + 50)  # Timely repayment
        elif days_late <= 7:
            user.credit_score = min(850, user.credit_score + 25)  # Slightly late
        else:
            user.credit_score = max(300, user.credit_score - 25)  # Late repayment
    
    db.commit()
    
    return {
        "message": "Loan repaid successfully",
        "days_late": days_late,
        "new_credit_score": user.credit_score if user else None
    }

@router.get("/{loan_id}/rp-benefits")
async def get_available_loan_benefits(
    loan_id: str,
    db: Session = Depends(get_db)
):
    """Get available RP benefits for a loan"""
    loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    applied_benefits = db.query(LoanRPBenefit).filter(
        LoanRPBenefit.loan_id == uuid.UUID(loan_id)
    ).all()
    applied_types = [benefit.benefit_type for benefit in applied_benefits]
    
    available_benefits = []
    
    if loan.status in [LoanStatus.PENDING.value, LoanStatus.APPROVED.value, LoanStatus.ACTIVE.value]:
        if "waive_interest" not in applied_types and loan.interest_rate > 0:
            available_benefits.append({
                "id": "waive_interest",
                "name": "Waive Interest",
                "description": f"Remove {loan.interest_rate:.1%} interest from this loan",
                "cost": settings.BENEFIT_COSTS["waive_interest"],
                "savings_usd": loan.loan_amount * loan.interest_rate
            })
        
        if "extend_loan_7days" not in applied_types:
            available_benefits.append({
                "id": "extend_loan_7days",
                "name": "Extend Loan (7 days)",
                "description": "Extend loan duration by 7 days",
                "cost": settings.BENEFIT_COSTS["extend_loan_7days"]
            })
        
        if "extend_loan_14days" not in applied_types:
            available_benefits.append({
                "id": "extend_loan_14days",
                "name": "Extend Loan (14 days)",
                "description": "Extend loan duration by 14 days",
                "cost": settings.BENEFIT_COSTS["extend_loan_14days"]
            })
        
        if "reduce_collateral" not in applied_types:
            available_benefits.append({
                "id": "reduce_collateral",
                "name": "Reduce Collateral",
                "description": "Reduce collateral requirement by 25%",
                "cost": settings.BENEFIT_COSTS["reduce_collateral"]
            })
    
    if loan.status == LoanStatus.PENDING.value and "instant_approval" not in applied_types:
        available_benefits.append({
            "id": "instant_approval",
            "name": "Instant Approval",
            "description": "Skip manual review and approve loan instantly",
            "cost": settings.BENEFIT_COSTS["instant_approval"]
        })
    
    return {
        "loan_id": loan_id,
        "available_benefits": available_benefits
    }

@router.post("/{loan_id}/apply-rp-benefit")
async def apply_rp_benefit_to_loan(
    loan_id: str,
    benefit_request: RPBenefitRequest,
    db: Session = Depends(get_db)
):
    """Apply RP benefit to a loan"""
    loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    from ..routers.gaming import get_user_rp_balance
    current_rp = get_user_rp_balance(user.id, db)
    if current_rp < benefit_request.rp_cost:
        raise HTTPException(status_code=400, detail="Insufficient RP balance")
    
    if benefit_request.benefit_type not in settings.BENEFIT_COSTS:
        raise HTTPException(status_code=400, detail="Invalid benefit type")
    
    expected_cost = settings.BENEFIT_COSTS[benefit_request.benefit_type]
    if benefit_request.rp_cost != expected_cost:
        raise HTTPException(status_code=400, detail="Invalid RP cost")
    
    # Apply the benefit
    if benefit_request.benefit_type == "waive_interest":
        loan.interest_rate = 0.0
        message = "Interest waived successfully"
    elif benefit_request.benefit_type == "extend_loan_7days":
        loan.due_date = loan.due_date + timedelta(days=7)
        message = "Loan extended by 7 days"
    elif benefit_request.benefit_type == "extend_loan_14days":
        loan.due_date = loan.due_date + timedelta(days=14)
        message = "Loan extended by 14 days"
    elif benefit_request.benefit_type == "instant_approval":
        loan.status = LoanStatus.APPROVED.value
        loan.approved_at = datetime.utcnow()
        message = "Loan approved instantly"
    elif benefit_request.benefit_type == "reduce_collateral":
        loan.collateral_amount = loan.collateral_amount * 0.75  # 25% reduction
        message = "Collateral requirement reduced by 25%"
    else:
        raise HTTPException(status_code=400, detail="Benefit not implemented")
    
    from ..database import PointsLedger as DBPointsLedger
    rp_transaction = DBPointsLedger(
        user_id=user.id,
        event_type="loan_benefit",
        points_delta=-benefit_request.rp_cost,
        description=f"Applied {benefit_request.benefit_type} to loan {loan_id}"
    )
    db.add(rp_transaction)
    
    benefit_record = LoanRPBenefit(
        loan_id=uuid.UUID(loan_id),
        benefit_type=benefit_request.benefit_type,
        rp_cost=benefit_request.rp_cost
    )
    db.add(benefit_record)
    
    db.commit()
    
    return {
        "message": message,
        "rp_spent": benefit_request.rp_cost,
        "new_rp_balance": current_rp - benefit_request.rp_cost
    }

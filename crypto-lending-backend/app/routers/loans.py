from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from datetime import datetime, timedelta
import uuid

from ..database import get_db, User as DBUser, Loan as DBLoan, Membership as DBMembership
from ..schemas import LoanRequest, LoanRequestV2, LoanResponse, LoanStatus
from ..config import MEMBERSHIP_TIERS, calculate_loan_terms, settings

router = APIRouter(prefix="/api/loans", tags=["loans"])


@router.post("/request")
async def request_loan(
    loan_request: LoanRequest,
    user_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Request a new loan (original endpoint)"""
    try:
        user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        membership = db.query(DBMembership).filter(DBMembership.user_id == uuid.UUID(user_id)).first()
        if not membership:
            raise HTTPException(status_code=400, detail="Membership required to request loans")
        
        tier_info = MEMBERSHIP_TIERS.get(membership.tier, {})
        max_loan_usd = tier_info.get("max_loan_usd", 0)
        
        if loan_request.amount_usd > max_loan_usd:
            raise HTTPException(
                status_code=400, 
                detail=f"Loan amount exceeds membership limit of ${max_loan_usd}"
            )
        
        active_loans = db.query(DBLoan).filter(
            DBLoan.user_id == uuid.UUID(user_id),
            DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
        ).all()
        
        if len(active_loans) >= 3:
            raise HTTPException(status_code=400, detail="Maximum active loans reached (3)")
        
        interest_rate = 0.0 if not membership.is_first_loan_used else 0.05
        collateral_percent = 110
        
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
            status=LoanStatus.APPROVED,
            due_date=due_date
        )
        
        if not membership.is_first_loan_used:
            membership.is_first_loan_used = True
        
        user.fiat_balance += loan_request.amount_usd
        
        db.add(new_loan)
        db.commit()
        db.refresh(new_loan)
        
        return {
            "loan_id": str(new_loan.id),
            "message": "Loan approved and disbursed",
            "amount_usd": loan_request.amount_usd,
            "interest_rate": interest_rate,
            "collateral_requirement": f"{collateral_percent}%",
            "due_date": due_date.isoformat(),
            "status": "approved",
            "first_loan_bonus": interest_rate == 0.0
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/request-v2")
async def request_loan_v2(
    loan_request: LoanRequestV2,
    user_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Request a new loan with currency support"""
    try:
        user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        membership = db.query(DBMembership).filter(DBMembership.user_id == uuid.UUID(user_id)).first()
        if not membership:
            raise HTTPException(status_code=400, detail="Membership required to request loans")
        
        tier_info = MEMBERSHIP_TIERS.get(membership.tier, {})
        
        if loan_request.currency == "USD":
            max_loan = tier_info.get("max_loan_usd", 0)
            amount_usd = loan_request.amount
        elif loan_request.currency == "NGN":
            max_loan = tier_info.get("max_loan_ngn", 0)
            amount_usd = loan_request.amount * settings.ngn_to_usd_rate
        else:
            raise HTTPException(status_code=400, detail="Unsupported currency")
        
        if loan_request.amount > max_loan:
            raise HTTPException(
                status_code=400,
                detail=f"Loan amount exceeds membership limit of {loan_request.currency} {max_loan}"
            )
        
        active_loans = db.query(DBLoan).filter(
            DBLoan.user_id == uuid.UUID(user_id),
            DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
        ).all()
        
        if len(active_loans) >= 3:
            raise HTTPException(status_code=400, detail="Maximum active loans reached (3)")
        
        interest_rate = 0.0 if not membership.is_first_loan_used else 0.05
        collateral_percent = 110
        
        due_date = datetime.utcnow() + timedelta(days=loan_request.duration_days)
        
        new_loan = DBLoan(
            user_id=uuid.UUID(user_id),
            amount=amount_usd,
            collateral_amount=loan_request.collateral_amount,
            collateral_asset=loan_request.collateral_crypto,
            loan_amount=amount_usd,
            loan_asset="USDC",
            interest_rate=interest_rate,
            duration_days=loan_request.duration_days,
            status=LoanStatus.APPROVED,
            due_date=due_date
        )
        
        if not membership.is_first_loan_used:
            membership.is_first_loan_used = True
        
        user.fiat_balance += amount_usd
        
        db.add(new_loan)
        db.commit()
        db.refresh(new_loan)
        
        return {
            "loan_id": str(new_loan.id),
            "message": "Loan approved and disbursed",
            "amount": loan_request.amount,
            "currency": loan_request.currency,
            "amount_usd": amount_usd,
            "interest_rate": interest_rate,
            "collateral_requirement": f"{collateral_percent}%",
            "due_date": due_date.isoformat(),
            "status": "approved",
            "first_loan_bonus": interest_rate == 0.0
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{loan_id}", response_model=LoanResponse)
async def get_loan(loan_id: str, db: Session = Depends(get_db)):
    """Get loan details"""
    try:
        loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        return LoanResponse(
            id=str(loan.id),
            user_id=str(loan.user_id),
            amount_usd=loan.loan_amount,
            duration_days=loan.duration_days,
            interest_rate=loan.interest_rate,
            collateral_requirement_percent=110,
            collateral_crypto=loan.collateral_asset,
            collateral_amount=loan.collateral_amount,
            purpose="General",
            status=loan.status,
            created_at=loan.created_at,
            due_date=loan.due_date,
            repaid_at=loan.repaid_at
        )
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid loan ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{loan_id}/approve")
async def approve_loan(loan_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Approve a pending loan (admin only)"""
    try:
        loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        if loan.status != LoanStatus.PENDING:
            raise HTTPException(status_code=400, detail="Loan is not pending approval")
        
        loan.status = LoanStatus.APPROVED
        
        user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
        if user:
            user.fiat_balance += loan.loan_amount
        
        db.commit()
        
        return {
            "message": "Loan approved successfully",
            "loan_id": str(loan.id),
            "status": "approved",
            "amount_disbursed": loan.loan_amount
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid loan ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{loan_id}/repay")
async def repay_loan(loan_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Repay a loan"""
    try:
        loan = db.query(DBLoan).filter(DBLoan.id == uuid.UUID(loan_id)).first()
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        if loan.status not in [LoanStatus.ACTIVE, LoanStatus.APPROVED]:
            raise HTTPException(status_code=400, detail="Loan is not active")
        
        user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        repayment_amount = loan.loan_amount * (1 + loan.interest_rate)
        
        if user.fiat_balance < repayment_amount:
            raise HTTPException(status_code=400, detail="Insufficient balance for repayment")
        
        user.fiat_balance -= repayment_amount
        loan.status = LoanStatus.REPAID
        loan.repaid_at = datetime.utcnow()
        
        user.credit_score = min(850, user.credit_score + 10)
        
        db.commit()
        
        return {
            "message": "Loan repaid successfully",
            "loan_id": str(loan.id),
            "repayment_amount": repayment_amount,
            "remaining_balance": user.fiat_balance,
            "new_credit_score": user.credit_score
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid loan ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

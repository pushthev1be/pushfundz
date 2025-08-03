from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List
from datetime import datetime

from ..database import get_db, User as DBUser, Loan as DBLoan, Membership as DBMembership
from ..schemas import LoanStatus, UserResponse, LoanResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get all users (admin only)"""
    try:
        total_users = db.query(DBUser).count()
        users = db.query(DBUser).offset(skip).limit(limit).all()
        
        user_list = []
        for user in users:
            membership = db.query(DBMembership).filter(DBMembership.user_id == user.id).first()
            user_loans = db.query(DBLoan).filter(DBLoan.user_id == user.id).all()
            
            user_data = {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "wallet_address": user.wallet_address,
                "credit_score": user.credit_score,
                "fiat_balance": user.fiat_balance,
                "tier": user.tier,
                "created_at": user.created_at,
                "membership_tier": membership.tier if membership else None,
                "total_loans": len(user_loans),
                "active_loans": len([loan for loan in user_loans if loan.status in ["active", "approved"]])
            }
            user_list.append(user_data)
        
        return {
            "users": user_list,
            "total": total_users,
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/loans/pending")
async def get_pending_loans(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get all pending loans (admin only)"""
    try:
        pending_loans = db.query(DBLoan).filter(DBLoan.status == LoanStatus.PENDING).all()
        
        loan_list = []
        for loan in pending_loans:
            user = db.query(DBUser).filter(DBUser.id == loan.user_id).first()
            membership = db.query(DBMembership).filter(DBMembership.user_id == loan.user_id).first()
            
            loan_data = {
                "id": str(loan.id),
                "user_id": str(loan.user_id),
                "user_name": user.name if user else "Unknown",
                "user_email": user.email if user else "Unknown",
                "membership_tier": membership.tier if membership else None,
                "amount_usd": loan.loan_amount,
                "duration_days": loan.duration_days,
                "interest_rate": loan.interest_rate,
                "collateral_crypto": loan.collateral_asset,
                "collateral_amount": loan.collateral_amount,
                "status": loan.status,
                "created_at": loan.created_at,
                "due_date": loan.due_date
            }
            loan_list.append(loan_data)
        
        return {
            "pending_loans": loan_list,
            "total_pending": len(loan_list)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/negative-balances")
async def get_negative_balance_users(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get users with negative balances (admin only)"""
    try:
        negative_balance_users = db.query(DBUser).filter(DBUser.fiat_balance < 0).all()
        
        user_list = []
        for user in negative_balance_users:
            active_loans = db.query(DBLoan).filter(
                DBLoan.user_id == user.id,
                DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
            ).all()
            
            overdue_loans = [
                loan for loan in active_loans 
                if loan.due_date < datetime.utcnow()
            ]
            
            user_data = {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "fiat_balance": user.fiat_balance,
                "credit_score": user.credit_score,
                "active_loans": len(active_loans),
                "overdue_loans": len(overdue_loans),
                "total_debt": sum(loan.loan_amount for loan in active_loans),
                "created_at": user.created_at
            }
            user_list.append(user_data)
        
        return {
            "negative_balance_users": user_list,
            "total_count": len(user_list),
            "total_negative_amount": sum(user.fiat_balance for user in negative_balance_users)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/stats")
async def get_admin_stats(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get comprehensive admin statistics"""
    try:
        total_users = db.query(DBUser).count()
        total_loans = db.query(DBLoan).count()
        total_memberships = db.query(DBMembership).count()
        
        active_loans = db.query(DBLoan).filter(
            DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value])
        ).count()
        
        repaid_loans = db.query(DBLoan).filter(DBLoan.status == LoanStatus.REPAID).count()
        defaulted_loans = db.query(DBLoan).filter(DBLoan.status == LoanStatus.DEFAULTED).count()
        
        total_disbursed = db.query(func.sum(DBLoan.loan_amount)).filter(
            DBLoan.status.in_([LoanStatus.ACTIVE.value, LoanStatus.APPROVED.value, LoanStatus.REPAID.value])
        ).scalar() or 0
        
        total_balance = db.query(func.sum(DBUser.fiat_balance)).scalar() or 0
        negative_balance_count = db.query(DBUser).filter(DBUser.fiat_balance < 0).count()
        
        membership_breakdown = db.query(
            DBMembership.tier,
            func.count(DBMembership.id)
        ).group_by(DBMembership.tier).all()
        
        return {
            "users": {
                "total": total_users,
                "with_memberships": total_memberships,
                "negative_balance": negative_balance_count
            },
            "loans": {
                "total": total_loans,
                "active": active_loans,
                "repaid": repaid_loans,
                "defaulted": defaulted_loans,
                "total_disbursed_usd": total_disbursed
            },
            "financial": {
                "total_user_balance": total_balance,
                "platform_exposure": total_disbursed - total_balance
            },
            "memberships": {
                tier: count for tier, count in membership_breakdown
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

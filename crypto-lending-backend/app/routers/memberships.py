from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any
import uuid

from ..database import get_db, User as DBUser, Membership as DBMembership, PointsLedger as DBPointsLedger
from ..schemas import MembershipCreate, MembershipResponse, MembershipTier
from ..auth import get_current_user
from ..config import MEMBERSHIP_TIERS

router = APIRouter(prefix="/api/memberships", tags=["memberships"])

@router.get("/tiers")
async def get_membership_tiers():
    """Get available membership tiers"""
    return {
        "tiers": MEMBERSHIP_TIERS
    }

@router.post("/purchase")
async def purchase_membership(
    membership_data: MembershipCreate,
    user_id: str,
    db: Session = Depends(get_db)
):
    """Purchase a membership tier"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    existing_membership = db.query(DBMembership).filter(DBMembership.user_id == user.id).first()
    if existing_membership:
        raise HTTPException(status_code=400, detail="User already has a membership")
    
    if membership_data.tier not in MEMBERSHIP_TIERS:
        raise HTTPException(status_code=400, detail="Invalid membership tier")
    
    tier_info = MEMBERSHIP_TIERS[membership_data.tier]
    
    expected_amount = tier_info["price_usd"] if membership_data.payment_currency == "USD" else tier_info["price_ngn"]
    if abs(membership_data.payment_amount - expected_amount) > 0.01:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    
    new_membership = DBMembership(
        user_id=user.id,
        tier=membership_data.tier,
        payment_amount_usd=tier_info["price_usd"],
        payment_currency=membership_data.payment_currency,
        is_first_loan_used=False
    )
    
    db.add(new_membership)
    
    tier_mapping = {"starter": 1, "standard": 2, "premium": 3}
    user.tier = tier_mapping.get(membership_data.tier, 0)
    
    rp_bonus = 25  # Base bonus
    if membership_data.tier == "premium":
        rp_bonus = 100
    elif membership_data.tier == "standard":
        rp_bonus = 50
    
    rp_transaction = DBPointsLedger(
        user_id=user.id,
        event_type="membership_purchase",
        points_delta=rp_bonus,
        description=f"Membership purchase bonus - {membership_data.tier} tier"
    )
    db.add(rp_transaction)
    
    db.commit()
    db.refresh(new_membership)
    
    return {
        "membership_id": str(new_membership.id),
        "tier": membership_data.tier,
        "benefits": tier_info["benefits"],
        "max_loan_usd": tier_info["max_loan_usd"],
        "rp_bonus": rp_bonus,
        "message": f"Successfully purchased {membership_data.tier} membership!"
    }

@router.get("/user/{user_id}")
async def get_user_membership(user_id: str, db: Session = Depends(get_db)):
    """Get user's membership details"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    membership = db.query(DBMembership).filter(DBMembership.user_id == user.id).first()
    
    if not membership:
        return {
            "has_membership": False,
            "tier": None,
            "max_loan_usd": 200,  # Basic limit without membership
            "benefits": ["Basic loan access up to $200"]
        }
    
    tier_info = MEMBERSHIP_TIERS[membership.tier]
    
    return {
        "has_membership": True,
        "membership_id": str(membership.id),
        "tier": membership.tier,
        "payment_date": membership.payment_date,
        "payment_amount_usd": membership.payment_amount_usd,
        "is_first_loan_used": membership.is_first_loan_used,
        "max_loan_usd": tier_info["max_loan_usd"],
        "benefits": tier_info["benefits"]
    }

@router.post("/upgrade")
async def upgrade_membership(
    new_tier: MembershipTier,
    user_id: str,
    payment_currency: str,
    payment_amount: float,
    db: Session = Depends(get_db)
):
    """Upgrade existing membership to higher tier"""
    user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    membership = db.query(DBMembership).filter(DBMembership.user_id == user.id).first()
    if not membership:
        raise HTTPException(status_code=400, detail="User doesn't have a membership to upgrade")
    
    tier_levels = {"starter": 1, "standard": 2, "premium": 3}
    current_level = tier_levels[membership.tier]
    new_level = tier_levels[new_tier]
    
    if new_level <= current_level:
        raise HTTPException(status_code=400, detail="Can only upgrade to higher tier")
    
    tier_info = MEMBERSHIP_TIERS[new_tier]
    expected_amount = tier_info["price_usd"] if payment_currency == "USD" else tier_info["price_ngn"]
    if abs(payment_amount - expected_amount) > 0.01:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    
    membership.tier = new_tier
    membership.payment_date = membership.created_at  # Keep original date
    membership.payment_amount_usd = tier_info["price_usd"]
    membership.payment_currency = payment_currency
    
    user.tier = tier_levels[new_tier]
    
    upgrade_bonus = (new_level - current_level) * 25
    rp_transaction = DBPointsLedger(
        user_id=user.id,
        event_type="membership_upgrade",
        points_delta=upgrade_bonus,
        description=f"Membership upgrade bonus - {membership.tier} to {new_tier}"
    )
    db.add(rp_transaction)
    
    db.commit()
    
    return {
        "message": f"Successfully upgraded to {new_tier} membership!",
        "new_tier": new_tier,
        "benefits": tier_info["benefits"],
        "max_loan_usd": tier_info["max_loan_usd"],
        "upgrade_bonus_rp": upgrade_bonus
    }

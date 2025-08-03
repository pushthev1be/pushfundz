from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any
from datetime import datetime
import uuid

from ..database import get_db, User as DBUser, Membership as DBMembership
from ..schemas import MembershipPurchase, MembershipUpgrade, MembershipResponse
from ..config import MEMBERSHIP_TIERS

router = APIRouter(prefix="/api/memberships", tags=["memberships"])


@router.get("/{user_id}", response_model=MembershipResponse)
async def get_membership_status(user_id: str, db: Session = Depends(get_db)):
    """Get user's membership status"""
    try:
        user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        membership = db.query(DBMembership).filter(DBMembership.user_id == uuid.UUID(user_id)).first()
        
        if not membership:
            return MembershipResponse(
                has_membership=False,
                tier=None,
                tier_name=None,
                payment_date=None,
                is_first_loan_used=False,
                max_loan_usd=None,
                max_loan_ngn=None
            )
        
        tier_info = MEMBERSHIP_TIERS.get(membership.tier, {})
        
        return MembershipResponse(
            has_membership=True,
            tier=membership.tier,
            tier_name=tier_info.get("name", membership.tier.title()),
            payment_date=membership.payment_date,
            is_first_loan_used=membership.is_first_loan_used,
            max_loan_usd=tier_info.get("max_loan_usd"),
            max_loan_ngn=tier_info.get("max_loan_ngn")
        )
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/purchase")
async def purchase_membership(
    membership_data: MembershipPurchase,
    user_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Purchase a membership tier"""
    try:
        user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        existing_membership = db.query(DBMembership).filter(DBMembership.user_id == uuid.UUID(user_id)).first()
        if existing_membership:
            raise HTTPException(status_code=400, detail="User already has a membership")
        
        tier_key = membership_data.tier.value
        if tier_key not in MEMBERSHIP_TIERS:
            raise HTTPException(status_code=400, detail="Invalid membership tier")
        
        tier_info = MEMBERSHIP_TIERS[tier_key]
        expected_amount = tier_info["price_usd"] if membership_data.payment_currency == "USD" else tier_info["price_ngn"]
        
        if abs(membership_data.payment_amount - expected_amount) > 0.01:
            raise HTTPException(status_code=400, detail="Invalid payment amount")
        
        if user.fiat_balance < membership_data.payment_amount:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        
        user.fiat_balance -= membership_data.payment_amount
        
        new_membership = DBMembership(
            user_id=uuid.UUID(user_id),
            tier=tier_key,
            payment_amount_usd=membership_data.payment_amount,
            payment_currency=membership_data.payment_currency,
            payment_date=datetime.utcnow()
        )
        
        db.add(new_membership)
        db.commit()
        db.refresh(new_membership)
        
        return {
            "message": f"{tier_info['name']} membership purchased successfully",
            "membership_id": str(new_membership.id),
            "tier": tier_key,
            "tier_name": tier_info["name"],
            "payment_amount": membership_data.payment_amount,
            "payment_currency": membership_data.payment_currency,
            "max_loan_usd": tier_info["max_loan_usd"],
            "max_loan_ngn": tier_info["max_loan_ngn"],
            "remaining_balance": user.fiat_balance
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/upgrade")
async def upgrade_membership(
    upgrade_data: MembershipUpgrade,
    user_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Upgrade existing membership to a higher tier"""
    try:
        user = db.query(DBUser).filter(DBUser.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        existing_membership = db.query(DBMembership).filter(DBMembership.user_id == uuid.UUID(user_id)).first()
        if not existing_membership:
            raise HTTPException(status_code=400, detail="User doesn't have a membership to upgrade")
        
        current_tier = existing_membership.tier
        new_tier = upgrade_data.new_tier.value
        
        tier_order = ["starter", "standard", "premium"]
        if tier_order.index(new_tier) <= tier_order.index(current_tier):
            raise HTTPException(status_code=400, detail="Can only upgrade to a higher tier")
        
        if new_tier not in MEMBERSHIP_TIERS:
            raise HTTPException(status_code=400, detail="Invalid membership tier")
        
        tier_info = MEMBERSHIP_TIERS[new_tier]
        current_tier_info = MEMBERSHIP_TIERS[current_tier]
        
        upgrade_cost = tier_info["price_usd"] - current_tier_info["price_usd"]
        if upgrade_data.payment_currency == "NGN":
            upgrade_cost = tier_info["price_ngn"] - current_tier_info["price_ngn"]
        
        if abs(upgrade_data.payment_amount - upgrade_cost) > 0.01:
            raise HTTPException(status_code=400, detail="Invalid upgrade payment amount")
        
        if user.fiat_balance < upgrade_data.payment_amount:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        
        user.fiat_balance -= upgrade_data.payment_amount
        existing_membership.tier = new_tier
        existing_membership.payment_amount_usd += upgrade_data.payment_amount
        existing_membership.updated_at = datetime.utcnow()
        
        db.commit()
        
        return {
            "message": f"Membership upgraded to {tier_info['name']} successfully",
            "membership_id": str(existing_membership.id),
            "old_tier": current_tier,
            "new_tier": new_tier,
            "tier_name": tier_info["name"],
            "upgrade_cost": upgrade_data.payment_amount,
            "payment_currency": upgrade_data.payment_currency,
            "max_loan_usd": tier_info["max_loan_usd"],
            "max_loan_ngn": tier_info["max_loan_ngn"],
            "remaining_balance": user.fiat_balance
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

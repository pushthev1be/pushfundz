from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import Optional, Dict, List
import random
import uuid
from datetime import datetime, timedelta, date
from enum import Enum

from ..database import get_db, User as DBUser, PointsLedger as DBPointsLedger, Transaction as DBTransaction

router = APIRouter(prefix="/api", tags=["gaming-rewards"])

# RP System Configuration
class RPTransactionType(str, Enum):
    DAILY_LOGIN = "daily_login"
    GAME_WIN = "game_win"
    GAME_LOSS = "game_loss"
    PURCHASE = "purchase"
    LOAN_BENEFIT = "loan_benefit"
    REFERRAL = "referral"

# RP Bundles
RP_BUNDLES = {
    "starter": {"rp": 100, "price": 5, "bonus": 0},
    "popular": {"rp": 500, "price": 20, "bonus": 50},
    "value": {"rp": 1200, "price": 40, "bonus": 200},
    "premium": {"rp": 3000, "price": 90, "bonus": 600}
}

# Game configurations
GAMES = {
    "rps": {
        "name": "Rock Paper Scissors",
        "min_bet": 10,
        "max_win_multiplier": 2.0,
        "house_edge": 0.02
    },
    "wheel": {
        "name": "Spin the Wheel",
        "cost": 25,
        "prizes": [0, 5, 10, 15, 20, 50, 100, 0],
        "weights": [25, 20, 20, 15, 10, 5, 2, 3]
    },
    "whot": {
        "name": "Whot Card Game",
        "min_bet": 50,
        "max_win_multiplier": 2.0,
        "ai_difficulty": 0.8
    }
}

# Daily reward structure
DAILY_REWARDS = [
    {"day": 1, "rp": 10},
    {"day": 2, "rp": 15},
    {"day": 3, "rp": 20},
    {"day": 4, "rp": 25},
    {"day": 5, "rp": 30},
    {"day": 6, "rp": 40},
    {"day": 7, "rp": 50}
]

# Helper functions
def get_user_rp_balance(user_id: uuid.UUID, db: Session) -> int:
    """Get user's current RP balance"""
    total_rp = db.query(func.sum(DBPointsLedger.points_delta)).filter(
        DBPointsLedger.user_id == user_id
    ).scalar() or 0
    return int(total_rp)

def add_rp_transaction(
    user_id: uuid.UUID,
    amount: int,
    transaction_type: str,
    description: str,
    db: Session
):
    """Add RP transaction to ledger"""
    transaction = DBPointsLedger(
        user_id=user_id,
        event_type=transaction_type,
        points_delta=amount,
        description=description
    )
    db.add(transaction)
    db.commit()
    return transaction

def get_user_daily_streak(user_id: uuid.UUID, db: Session) -> int:
    """Calculate user's daily login streak"""
    recent_claims = db.query(DBPointsLedger).filter(
        and_(
            DBPointsLedger.user_id == user_id,
            DBPointsLedger.event_type == RPTransactionType.DAILY_LOGIN,
            DBPointsLedger.event_timestamp >= datetime.utcnow() - timedelta(days=7)
        )
    ).order_by(DBPointsLedger.event_timestamp.desc()).all()
    
    if not recent_claims:
        return 0
    
    streak = 0
    current_date = date.today()
    
    for claim in recent_claims:
        claim_date = claim.event_timestamp.date()
        if claim_date == current_date - timedelta(days=streak):
            streak += 1
        else:
            break
    
    return streak

@router.get("/rp/balance")
async def get_rp_balance(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Get user's RP balance"""
    user_uuid = uuid.UUID(user_id)
    balance = get_user_rp_balance(user_uuid, db)
    streak = get_user_daily_streak(user_uuid, db)
    
    today_start = datetime.combine(date.today(), datetime.min.time())
    existing_claim = db.query(DBPointsLedger).filter(
        and_(
            DBPointsLedger.user_id == user_uuid,
            DBPointsLedger.event_type == RPTransactionType.DAILY_LOGIN,
            DBPointsLedger.event_timestamp >= today_start
        )
    ).first()
    
    return {
        "balance": balance,
        "streak": streak,
        "canClaimDaily": existing_claim is None
    }

@router.post("/rp/daily-reward")
async def claim_daily_reward(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Claim daily login reward"""
    user_uuid = uuid.UUID(user_id)
    
    today_start = datetime.combine(date.today(), datetime.min.time())
    existing_claim = db.query(DBPointsLedger).filter(
        and_(
            DBPointsLedger.user_id == user_uuid,
            DBPointsLedger.event_type == RPTransactionType.DAILY_LOGIN,
            DBPointsLedger.event_timestamp >= today_start
        )
    ).first()
    
    if existing_claim:
        return {
            "canClaim": False,
            "streak": get_user_daily_streak(user_uuid, db),
            "message": "Already claimed today"
        }
    
    streak = get_user_daily_streak(user_uuid, db) + 1
    reward_index = min(streak - 1, 6)
    reward = DAILY_REWARDS[reward_index]["rp"]
    
    add_rp_transaction(
        user_uuid,
        reward,
        RPTransactionType.DAILY_LOGIN,
        f"Daily login reward - Day {streak}",
        db
    )
    
    return {
        "claimed": True,
        "reward": reward,
        "newStreak": streak,
        "canClaim": False
    }

@router.post("/rp/purchase")
async def purchase_rp(
    request: dict,
    db: Session = Depends(get_db)
):
    """Purchase RP bundle"""
    user_id = uuid.UUID(request["user_id"])
    bundle_type = request["bundle"]
    
    if bundle_type not in RP_BUNDLES:
        raise HTTPException(status_code=400, detail="Invalid bundle type")
    
    bundle = RP_BUNDLES[bundle_type]
    total_rp = bundle["rp"] + bundle["bonus"]
    
    add_rp_transaction(
        user_id,
        total_rp,
        RPTransactionType.PURCHASE,
        f"Purchased {bundle_type} bundle",
        db
    )
    
    return {
        "success": True,
        "rp_received": total_rp,
        "cost": bundle["price"],
        "bonus": bundle["bonus"]
    }

@router.post("/games/play")
async def play_game(
    request: dict,
    db: Session = Depends(get_db)
):
    """Play a game with RP"""
    user_id = uuid.UUID(request["user_id"])
    game_type = request["game"]
    bet_amount = request.get("bet", {})
    
    current_balance = get_user_rp_balance(user_id, db)
    
    if game_type == "rps":
        bet = bet_amount.get("amount", 10)
        choice = bet_amount.get("choice", "rock")
        
        if current_balance < bet:
            raise HTTPException(status_code=400, detail="Insufficient RP balance")
        
        cpu_choice = random.choice(["rock", "paper", "scissors"])
        
        rand = random.random()
        if rand < 0.6:
            win_against = {"rock": "paper", "paper": "scissors", "scissors": "rock"}
            cpu_choice = win_against[choice]
            result = "lose"
            rp_change = -bet
        elif rand < 0.9:
            cpu_choice = choice
            result = "draw"
            rp_change = 0
        else:
            # Player wins
            lose_against = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
            cpu_choice = lose_against[choice]
            result = "win"
            rp_change = bet
        
        if rp_change != 0:
            add_rp_transaction(
                user_id,
                rp_change,
                RPTransactionType.GAME_WIN if rp_change > 0 else RPTransactionType.GAME_LOSS,
                f"RPS game {result}",
                db
            )
        
        return {
            "result": result,
            "playerChoice": choice,
            "cpuChoice": cpu_choice,
            "rpChange": rp_change,
            "newBalance": current_balance + rp_change
        }
    
    elif game_type == "wheel":
        cost = GAMES["wheel"]["cost"]
        
        if current_balance < cost:
            raise HTTPException(status_code=400, detail="Insufficient RP balance")
        
        prizes = GAMES["wheel"]["prizes"]
        weights = GAMES["wheel"]["weights"]
        
        prize = random.choices(prizes, weights=weights)[0]
        net_change = prize - cost
        
        add_rp_transaction(
            user_id,
            net_change,
            RPTransactionType.GAME_WIN if net_change > 0 else RPTransactionType.GAME_LOSS,
            f"Spin wheel - won {prize} RP",
            db
        )
        
        return {
            "prize": prize,
            "cost": cost,
            "netChange": net_change,
            "newBalance": current_balance + net_change
        }
    
    elif game_type == "whot":
        bet = bet_amount.get("amount", 50)
        
        if current_balance < bet:
            raise HTTPException(status_code=400, detail="Insufficient RP balance")
        
        player_wins = random.random() > GAMES["whot"]["ai_difficulty"]
        
        if player_wins:
            rp_change = bet
            result = "win"
        else:
            rp_change = -bet
            result = "lose"
        
        add_rp_transaction(
            user_id,
            rp_change,
            RPTransactionType.GAME_WIN if rp_change > 0 else RPTransactionType.GAME_LOSS,
            f"Whot game {result}",
            db
        )
        
        return {
            "result": result,
            "rpChange": rp_change,
            "newBalance": current_balance + rp_change
        }
    
    else:
        raise HTTPException(status_code=400, detail="Invalid game type")

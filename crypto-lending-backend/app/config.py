from typing import Dict, Any
import os
from functools import lru_cache

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./pushfundz.db")
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    DAILY_REWARDS = [
        {"day": 1, "rp": 10},
        {"day": 2, "rp": 15},
        {"day": 3, "rp": 20},
        {"day": 4, "rp": 25},
        {"day": 5, "rp": 30},
        {"day": 6, "rp": 40},
        {"day": 7, "rp": 50}  # Weekly bonus
    ]
    
    GAME_CONFIG = {
        "rps": {
            "house_edge": 0.02,  # 2% - subtle but profitable
            "min_bet": 10,
            "max_bet": 500
        },
        "wheel": {
            "prizes": [0, 5, 10, 15, 20, 50, 100, 0],
            "weights": [25, 20, 20, 15, 10, 5, 2, 3],
            "cost": 25
        },
        "whot": {
            "ai_difficulty": 0.8,  # AI wins 80% of games
            "min_bet": 50,
            "max_bet": 1000
        }
    }
    
    RP_BUNDLES = {
        "starter": {
            "rp": 100,
            "price": 5,
            "bonus": 0
        },
        "popular": {
            "rp": 500,
            "price": 20,
            "bonus": 50,  # 10% bonus
            "badge": "MOST POPULAR"
        },
        "value": {
            "rp": 1200,
            "price": 40,
            "bonus": 200,  # 17% bonus
            "badge": "BEST VALUE"
        },
        "premium": {
            "rp": 3000,
            "price": 90,
            "bonus": 600,  # 20% bonus
            "badge": "VIP"
        }
    }
    
    BENEFIT_COSTS = {
        "waive_interest": 500,       # High value benefit
        "extend_loan_7days": 300,    # Moderate cost
        "extend_loan_14days": 500,   # Higher for more days
        "instant_approval": 200,     # Convenience fee
        "reduce_collateral": 800,    # Premium benefit
        "emergency_loan": 1000       # Highest tier
    }

MEMBERSHIP_TIERS = {
    "starter": {
        "name": "Starter",
        "price_usd": 25,
        "price_ngn": 15000,
        "max_loan_usd": 500,
        "benefits": [
            "Basic loan access",
            "Standard interest rates",
            "Email support"
        ]
    },
    "standard": {
        "name": "Standard", 
        "price_usd": 50,
        "price_ngn": 30000,
        "max_loan_usd": 2000,
        "benefits": [
            "Higher loan limits",
            "Reduced interest rates",
            "Priority support",
            "First loan interest-free"
        ]
    },
    "premium": {
        "name": "Premium",
        "price_usd": 100,
        "price_ngn": 60000,
        "max_loan_usd": 5000,
        "benefits": [
            "Maximum loan limits",
            "Lowest interest rates",
            "24/7 priority support",
            "First loan interest-free",
            "Exclusive RP bonuses"
        ]
    }
}

def calculate_loan_terms(credit_score: int, loan_amount: float) -> tuple[float, int]:
    """Calculate interest rate and collateral requirement based on credit score and amount"""
    
    if credit_score >= 750:
        base_rate = 0.08  # 8% for excellent credit
    elif credit_score >= 700:
        base_rate = 0.12  # 12% for good credit
    elif credit_score >= 650:
        base_rate = 0.15  # 15% for fair credit
    else:
        base_rate = 0.20  # 20% for poor credit
    
    if loan_amount > 2000:
        base_rate += 0.02
    elif loan_amount > 1000:
        base_rate += 0.01
    
    if credit_score >= 750:
        collateral_percent = 120  # 120% collateral for excellent credit
    elif credit_score >= 700:
        collateral_percent = 130  # 130% for good credit
    elif credit_score >= 650:
        collateral_percent = 150  # 150% for fair credit
    else:
        collateral_percent = 200  # 200% for poor credit
    
    return base_rate, collateral_percent

@lru_cache()
def get_settings():
    return Settings()

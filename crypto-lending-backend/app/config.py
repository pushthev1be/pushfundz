from pydantic import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    database_url: str = "sqlite:///./pushfundz.db"
    secret_key: str = "your-super-secret-key-change-this-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    security_service_url: str = "http://localhost:3007"
    enable_security_check: bool = False
    
    ngn_to_usd_rate: float = 0.0008
    usd_to_ngn_rate: float = 1250
    
    environment: str = "development"
    
    class Config:
        env_file = ".env"


settings = Settings()


def get_settings() -> Settings:
    return settings


MEMBERSHIP_TIERS = {
    "starter": {
        "name": "Starter",
        "price_usd": 5,
        "price_ngn": 7500,
        "max_loan_usd": 5,
        "max_loan_ngn": 7500,
        "features": [
            "Max loan: $5 / ₦7,500",
            "First loan interest-free",
            "Basic support",
            "Referral bonuses"
        ]
    },
    "standard": {
        "name": "Standard", 
        "price_usd": 10,
        "price_ngn": 15000,
        "max_loan_usd": 15,
        "max_loan_ngn": 22500,
        "features": [
            "Max loan: $15 / ₦22,500",
            "First loan interest-free",
            "Priority support",
            "Higher referral bonuses"
        ]
    },
    "premium": {
        "name": "Premium",
        "price_usd": 30,
        "price_ngn": 45000,
        "max_loan_usd": 40,
        "max_loan_ngn": 60000,
        "features": [
            "Max loan: $40 / ₦60,000",
            "First loan interest-free",
            "VIP support",
            "Maximum referral bonuses"
        ]
    }
}


def calculate_loan_terms(credit_score: int, amount_usd: float):
    if credit_score >= 750:
        interest_rate = 0.05
        collateral_percent = 110
    elif credit_score >= 650:
        interest_rate = 0.08
        collateral_percent = 120
    else:
        interest_rate = 0.12
        collateral_percent = 150
    
    return interest_rate, collateral_percent

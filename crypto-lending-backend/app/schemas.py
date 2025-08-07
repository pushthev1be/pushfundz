from pydantic import BaseModel, validator, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import re

class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    ACTIVE = "active"
    REPAID = "repaid"
    DEFAULTED = "defaulted"

class MembershipTier(str, Enum):
    STARTER = "starter"
    STANDARD = "standard"
    PREMIUM = "premium"

class RPTransactionType(str, Enum):
    DAILY_LOGIN = "daily_login"
    GAME_WIN = "game_win"
    GAME_LOSS = "game_loss"
    PURCHASE = "purchase"
    LOAN_BENEFIT = "loan_benefit"
    REFERRAL = "referral"

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    wallet_address: Optional[str] = None
    referral_code: Optional[str] = None
    
    @validator('wallet_address')
    def validate_wallet_address(cls, v):
        if v and not re.match(r'^0x[a-fA-F0-9]{40}$', v):
            raise ValueError('Invalid Ethereum wallet address')
        return v

class UserLogin(BaseModel):
    email: Optional[str] = None
    wallet_address: Optional[str] = None
    
    @validator('wallet_address')
    def validate_wallet_address(cls, v):
        if v and not re.match(r'^0x[a-fA-F0-9]{40}$', v):
            raise ValueError('Invalid Ethereum wallet address')
        return v

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    wallet_address: Optional[str]
    credit_score: int
    fiat_balance: float
    tier: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class LoanRequest(BaseModel):
    amount_usd: float = Field(..., gt=0, le=10000)
    duration_days: int = Field(..., ge=7, le=365)
    collateral_crypto: str
    collateral_amount: float = Field(..., gt=0)
    purpose: str = Field(..., min_length=10, max_length=500)

class LoanResponse(BaseModel):
    id: str
    user_id: str
    amount_usd: float
    duration_days: int
    interest_rate: float
    collateral_crypto: str
    collateral_amount: float
    purpose: str
    status: LoanStatus
    created_at: datetime
    due_date: Optional[datetime]
    repaid_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class MembershipCreate(BaseModel):
    tier: MembershipTier
    payment_currency: str = Field(..., pattern=r'^(USD|NGN)$')
    payment_amount: float = Field(..., gt=0)

class MembershipResponse(BaseModel):
    id: str
    user_id: str
    tier: str
    payment_date: datetime
    payment_amount_usd: float
    payment_currency: str
    is_first_loan_used: bool
    
    class Config:
        from_attributes = True

class GamePlayRequest(BaseModel):
    user_id: str
    game: str = Field(..., pattern=r'^(rps|wheel|whot)$')
    bet: Dict[str, Any]

class RPPurchaseRequest(BaseModel):
    user_id: str
    bundle: str = Field(..., pattern=r'^(starter|popular|value|premium)$')

class RPBenefitRequest(BaseModel):
    loan_id: str
    benefit_type: str
    rp_cost: int = Field(..., gt=0)

class AdminLoginRequest(BaseModel):
    email: str
    password: str

class AdminUserResponse(BaseModel):
    id: str
    name: str
    email: str
    wallet_address: Optional[str]
    credit_score: int
    fiat_balance: float
    tier: int
    created_at: datetime
    membership_tier: Optional[str]
    total_loans: int
    active_loans: int
    
    class Config:
        from_attributes = True

class StatsResponse(BaseModel):
    users: Dict[str, int]
    loans: Dict[str, Any]
    financial: Dict[str, float]
    memberships: Dict[str, int]
    
    class Config:
        from_attributes = True

class PaymentRequest(BaseModel):
    loan_id: str
    payment_method: str
    local_currency: str
    amount_local: float = Field(..., gt=0)

class TransactionResponse(BaseModel):
    id: str
    user_id: str
    loan_id: Optional[str]
    transaction_type: str
    amount: float
    currency: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]
    
    class Config:
        from_attributes = True

from pydantic import BaseModel, validator
from typing import Optional, List
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


class UserBase(BaseModel):
    name: str
    email: str
    wallet_address: Optional[str] = None


class UserCreate(UserBase):
    @validator('wallet_address')
    def validate_wallet_address(cls, v):
        if v is None:
            return v
        
        if re.match(r'^0x[a-fA-F0-9]{40}$', v):
            return v
        if re.match(r'^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$', v) or re.match(r'^bc1[a-z0-9]{39,59}$', v):
            return v
        if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', v):
            return v
            
        raise ValueError('Invalid wallet address format')


class UserLogin(BaseModel):
    email: Optional[str] = None
    wallet_address: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    wallet_address: Optional[str]
    credit_score: int
    fiat_balance: float
    tier: str
    created_at: datetime

    class Config:
        from_attributes = True


class LoanRequest(BaseModel):
    amount_usd: float
    duration_days: int
    collateral_crypto: str
    collateral_amount: float
    purpose: str


class LoanRequestV2(BaseModel):
    amount: float
    currency: str  # "USD" or "NGN"
    duration_days: int
    collateral_crypto: str
    collateral_amount: float
    purpose: str


class LoanResponse(BaseModel):
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

    class Config:
        from_attributes = True


class MembershipPurchase(BaseModel):
    tier: MembershipTier
    payment_method: str
    payment_currency: str = "USD"
    payment_amount: float


class MembershipUpgrade(BaseModel):
    new_tier: MembershipTier
    payment_method: str
    payment_currency: str = "USD"
    payment_amount: float


class MembershipResponse(BaseModel):
    has_membership: bool
    tier: Optional[str] = None
    tier_name: Optional[str] = None
    payment_date: Optional[datetime] = None
    is_first_loan_used: bool = False
    max_loan_usd: Optional[float] = None
    max_loan_ngn: Optional[float] = None

    class Config:
        from_attributes = True


class PaymentRequest(BaseModel):
    loan_id: str
    payment_method: str
    local_currency: str
    amount_local: float


class WalletFundRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str


class ReferralGenerate(BaseModel):
    user_id: str


class StatsResponse(BaseModel):
    total_users: int
    total_loans: int
    total_amount_disbursed: float
    active_loans: int
    default_rate: float

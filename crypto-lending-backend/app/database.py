from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import TypeDecorator, CHAR
import uuid
from datetime import datetime
import os

class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as stringified hex values.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(value)
            else:
                return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            return value

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pushfundz.db")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    wallet_address = Column(String, unique=True, nullable=True)
    fiat_balance = Column(Float, default=0.0)
    credit_score = Column(Integer, default=600)
    tier = Column(Integer, default=0)  # 0=Bronze, 1=Silver, 2=Gold, 3=Platinum
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    loans = relationship("Loan", back_populates="user")
    points_ledger = relationship("PointsLedger", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    membership = relationship("Membership", back_populates="user", uselist=False)

class Loan(Base):
    __tablename__ = "loans"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="USD")
    collateral_amount = Column(Float, nullable=True)
    collateral_asset = Column(String, nullable=True)
    loan_amount = Column(Float, nullable=False)
    loan_asset = Column(String, default="USDC")
    interest_rate = Column(Float, nullable=False)
    duration_days = Column(Integer, nullable=False)
    status = Column(String, default="pending")  # pending, approved, active, repaid, defaulted
    blockchain_tx_hash = Column(String, nullable=True)
    collateral_tx_hash = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    repaid_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="loans")

class PointsLedger(Base):
    __tablename__ = "points_ledger"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    event_type = Column(String, nullable=False)  # loan_repaid, early_repayment, referral, etc.
    points_delta = Column(Integer, nullable=False)  # positive for earning, negative for redemption
    description = Column(Text, nullable=True)
    blockchain_tx_hash = Column(String, nullable=True)
    event_timestamp = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="points_ledger")

class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    loan_id = Column(GUID(), ForeignKey("loans.id"), nullable=True)
    transaction_type = Column(String, nullable=False)  # fiat_deposit, loan_disbursement, repayment, etc.
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, completed, failed
    external_tx_id = Column(String, nullable=True)  # Ramp/Transak transaction ID
    blockchain_tx_hash = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="transactions")


class Membership(Base):
    __tablename__ = "memberships"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    tier = Column(String, nullable=False)  # starter, standard, premium
    payment_date = Column(DateTime, default=datetime.utcnow)
    payment_amount_usd = Column(Float, nullable=False)
    payment_currency = Column(String, default="USD")
    is_first_loan_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="membership")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    Base.metadata.create_all(bind=engine)

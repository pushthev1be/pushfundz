"""
Migration script to add Membership and ReferralCode tables
Run this script to update the database schema
"""

from sqlalchemy import create_engine, text
from database import Base, engine

def run_migration():
    """Add new tables for membership and referral system"""
    
    membership_sql = """
    CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tier TEXT NOT NULL,
        price_paid REAL NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );
    """
    
    referral_sql = """
    CREATE TABLE IF NOT EXISTS referral_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        uses_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );
    """
    
    loan_currency_sql = """
    ALTER TABLE loans ADD COLUMN currency TEXT DEFAULT 'USD';
    """
    
    user_columns_sql = """
    ALTER TABLE users ADD COLUMN first_loan_used BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN referred_by TEXT;
    """
    
    with engine.connect() as conn:
        try:
            conn.execute(text(membership_sql))
            print("✓ Created memberships table")
            
            conn.execute(text(referral_sql))
            print("✓ Created referral_codes table")
            
            try:
                conn.execute(text(loan_currency_sql))
                print("✓ Added currency column to loans table")
            except Exception as e:
                print(f"Currency column may already exist: {e}")
            
            try:
                conn.execute(text(user_columns_sql))
                print("✓ Added first_loan_used and referred_by columns to users table")
            except Exception as e:
                print(f"User columns may already exist: {e}")
                
            conn.commit()
            print("✓ Migration completed successfully")
            
        except Exception as e:
            print(f"Migration failed: {e}")
            conn.rollback()

if __name__ == "__main__":
    run_migration()

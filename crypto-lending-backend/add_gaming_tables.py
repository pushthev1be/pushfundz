import sys
sys.path.append('.')
from app.database import engine
from sqlalchemy import text

migrations = [
    """
    CREATE TABLE IF NOT EXISTS daily_login_streak (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        last_claim_date DATE,
        streak_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS game_states (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        game_type VARCHAR(50),
        state JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS loan_rp_benefits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id UUID REFERENCES loans(id),
        benefit_type VARCHAR(50),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rp_cost INTEGER
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_points_ledger_user_id ON points_ledger(user_id)
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_claim DATE
    """
]

with engine.connect() as conn:
    for migration in migrations:
        try:
            conn.execute(text(migration))
            print(f"✅ Executed: {migration.split()[0]} {migration.split()[1]}")
        except Exception as e:
            print(f"ℹ️  Skipped (may already exist): {str(e)[:50]}")
    conn.commit()

print("\n✅ Gaming tables created successfully!")

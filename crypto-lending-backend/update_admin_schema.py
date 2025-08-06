import sys
sys.path.append('.')
from app.database import engine, Base
from sqlalchemy import Column, Boolean, String, text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
        print("✅ Added is_admin column")
    except Exception as e:
        print("ℹ️  is_admin column might already exist:", str(e))
    
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR"))
        print("✅ Added hashed_password column")
    except Exception as e:
        print("ℹ️  hashed_password column might already exist:", str(e))
    
    conn.commit()

print("✅ Database schema updated")

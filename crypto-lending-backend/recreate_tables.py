import sys
sys.path.append('.')
from app.database import create_tables

print("🔄 Recreating database tables...")
create_tables()
print("✅ Tables recreated successfully!")

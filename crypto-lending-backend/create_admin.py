import sys
sys.path.append('.')
from app.database import SessionLocal, User
from passlib.context import CryptContext
import uuid
import getpass

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_admin_user():
    print("\n🔐 Create Admin User")
    print("===================")
    
    email = input("Admin email: ")
    name = input("Admin name: ")
    password = getpass.getpass("Admin password: ")
    confirm_password = getpass.getpass("Confirm password: ")
    
    if password != confirm_password:
        print("❌ Passwords do not match!")
        return
    
    db = SessionLocal()
    
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        if existing.is_admin:
            print(f"❌ Admin with email {email} already exists")
        else:
            existing.is_admin = True
            existing.hashed_password = pwd_context.hash(password)
            db.commit()
            print(f"✅ User {email} upgraded to admin")
        return
    
    admin_user = User(
        id=uuid.uuid4(),
        name=name,
        email=email,
        is_admin=True,
        hashed_password=pwd_context.hash(password),
        credit_score=850,
        fiat_balance=0.0,
        tier=3
    )
    
    db.add(admin_user)
    db.commit()
    print(f"✅ Admin user created: {email}")

if __name__ == "__main__":
    create_admin_user()

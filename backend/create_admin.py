from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.auth import hash_password
from app.models import User, UserRole

EMAIL = "roshan@docketai.com"
PASSWORD = "1111"  # change later

db: Session = SessionLocal()

user = db.query(User).filter(User.email == EMAIL).first()
if user:
    user.password_hash = hash_password(PASSWORD)
    user.role = UserRole.ADMIN
    user.is_active = True
    db.commit()
    print("Updated existing user -> admin + password set")
else:
    user = User(
        name="Roshan",
        email=EMAIL,
        password_hash=hash_password(PASSWORD),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    print("Created new admin user")

db.close()

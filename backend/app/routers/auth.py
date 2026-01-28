import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request

from app.db import get_db
from app.auth import create_access_token, get_current_user
from app import schemas, crud
from app.models import User, UserEventType, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/google")
async def google_login(request: Request):
    """Initiate Google OAuth login flow."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured")
    
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        # Redirect to frontend with error
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=auth_failed")
    
    user_info = token.get("userinfo")
    if not user_info:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=no_user_info")
    
    google_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name", email.split("@")[0] if email else "User")
    
    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=no_email")
    
    # Find or create user
    user = db.query(User).filter(User.google_id == google_id).first()
    
    if not user:
        # Check if user exists by email (might have been pre-created by admin)
        user = db.query(User).filter(User.email == email).first()
        
        if user:
            # Link existing user to Google account
            user.google_id = google_id
            if not user.name or user.name == email:
                user.name = name
            db.commit()
        else:
            # Check if this is the first user (make them admin)
            user_count = db.query(User).count()
            is_first_user = user_count == 0
            
            # Create new user
            user = User(
                name=name,
                email=email,
                google_id=google_id,
                password_hash=None,  # No password for Google users
                role=UserRole.ADMIN if is_first_user else UserRole.EMPLOYEE,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            # Log user creation event
            notes = "First user - auto-assigned ADMIN role via Google OAuth" if is_first_user else "Self-registered via Google OAuth"
            crud.add_user_event(
                db,
                event_type=UserEventType.USER_CREATED,
                target_user_id=user.id,
                actor_user_id=user.id,
                notes=notes,
            )
    
    if not user.is_active:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=account_disabled")
    
    # Create JWT token
    jwt_token = create_access_token(subject=user.email)
    
    # Redirect to frontend with token
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


@router.get("/me", response_model=schemas.UserRead)
def me(user=Depends(get_current_user)):
    return user

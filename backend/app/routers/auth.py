import os
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request

from app.db import get_db
from app.auth import create_access_token, get_current_user
from app import schemas, crud
from app.models import User, UserEventType, UserRole, Organization, InviteCode, PUBLIC_EMAIL_DOMAINS

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


def get_or_create_organization(db: Session, email: str, invite_code: str | None = None) -> tuple[Organization, bool]:
    """
    Get or create an organization for a user based on their email.
    Returns (organization, is_first_user_in_org).
    """
    domain = email.split("@")[1].lower()
    
    # Check if user has an invite code
    if invite_code:
        invite = db.query(InviteCode).filter(
            InviteCode.code == invite_code,
            InviteCode.is_active == True
        ).first()
        
        if invite:
            # Check if invite is still valid
            if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
                pass  # Expired, fall through to normal flow
            elif invite.max_uses and invite.uses >= invite.max_uses:
                pass  # Max uses reached, fall through
            else:
                # Valid invite - join this org
                invite.uses += 1
                db.commit()
                org = invite.organization
                is_first = db.query(User).filter(User.organization_id == org.id).count() == 0
                return org, is_first
    
    # Check if this is a public email domain
    if domain in PUBLIC_EMAIL_DOMAINS:
        # Create a personal org for this user
        org = Organization(
            name=f"{email.split('@')[0]}'s Workspace",
            domain=None,  # No domain for personal orgs
            is_personal=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org, True  # Always first user in personal org
    
    # Company domain - find or create org
    org = db.query(Organization).filter(Organization.domain == domain).first()
    
    if org:
        # Org exists, check if this is the first user
        is_first = db.query(User).filter(User.organization_id == org.id).count() == 0
        return org, is_first
    else:
        # Create new org for this domain
        org = Organization(
            name=domain.split(".")[0].title() + " Organization",  # e.g., "Acme Organization"
            domain=domain,
            is_personal=False,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org, True  # First user in new org


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
    
    # Check for invite code in session
    invite_code = request.session.get("invite_code")
    
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
            
            # If user doesn't have an org, assign one
            if not user.organization_id:
                org, is_first = get_or_create_organization(db, email, invite_code)
                user.organization_id = org.id
                if is_first:
                    user.role = UserRole.ADMIN
            
            db.commit()
        else:
            # Get or create organization
            org, is_first_in_org = get_or_create_organization(db, email, invite_code)
            
            # Create new user
            user = User(
                name=name,
                email=email,
                google_id=google_id,
                password_hash=None,  # No password for Google users
                role=UserRole.ADMIN if is_first_in_org else UserRole.EMPLOYEE,
                is_active=True,
                organization_id=org.id,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            # Log user creation event with invite info if applicable
            if is_first_in_org:
                notes = f"First user in org '{org.name}' - auto-assigned ADMIN role"
            elif invite_code:
                # Look up invite details for audit trail
                invite = db.query(InviteCode).filter(InviteCode.code == invite_code).first()
                if invite and invite.created_by:
                    notes = f"Joined org '{org.name}' via invite from {invite.created_by.name}"
                else:
                    notes = f"Joined org '{org.name}' via invite link"
            else:
                notes = f"Joined org '{org.name}' via Google OAuth"
            
            crud.add_user_event(
                db,
                event_type=UserEventType.USER_CREATED,
                target_user_id=user.id,
                actor_user_id=user.id,
                notes=notes,
            )
    
    # Clear invite code from session
    if "invite_code" in request.session:
        del request.session["invite_code"]
    
    if not user.is_active:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=account_disabled")
    
    # Create JWT token
    jwt_token = create_access_token(subject=user.email)
    
    # Redirect to frontend with token
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


@router.get("/me", response_model=schemas.UserRead)
def me(user=Depends(get_current_user)):
    # Add organization name if available
    org_name = user.organization.name if user.organization else None
    return schemas.UserRead(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        organization_id=user.organization_id,
        organization_name=org_name,
    )


@router.delete("/leave-organization")
def leave_organization(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Allow a user to leave their organization.
    Clears their google_id so they can sign in fresh and join a new org.
    """
    from app.models import Asset, AssetStatus
    
    org_name = user.organization.name if user.organization else "Unknown"
    
    # Return any hardware assets assigned to this user
    assigned_assets = db.query(Asset).filter(
        Asset.assigned_to_user_id == user.id
    ).all()
    
    for asset in assigned_assets:
        asset.assigned_to_user_id = None
        asset.status = AssetStatus.IN_STOCK
    
    # Log the event
    crud.add_user_event(
        db,
        event_type=UserEventType.USER_DEACTIVATED,
        target_user_id=user.id,
        actor_user_id=user.id,
        notes=f"User left organization '{org_name}' voluntarily",
    )
    
    # Clear google_id so they can re-register, deactivate, and remove from org
    user.google_id = None
    user.organization_id = None
    user.is_active = False
    
    db.commit()
    
    return {"message": "Successfully left organization. You can sign in again to join a new organization."}


@router.get("/join/{invite_code}")
async def join_with_invite(invite_code: str, request: Request, db: Session = Depends(get_db)):
    """Store invite code in session and redirect to Google login."""
    # Validate invite code exists and is active
    invite = db.query(InviteCode).filter(
        InviteCode.code == invite_code,
        InviteCode.is_active == True
    ).first()
    
    if not invite:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=invalid_invite")
    
    # Check if expired
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=invite_expired")
    
    # Check if max uses reached
    if invite.max_uses and invite.uses >= invite.max_uses:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=invite_exhausted")
    
    # Store in session
    request.session["invite_code"] = invite_code
    
    # Redirect to Google login
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/organization", response_model=schemas.OrganizationRead)
def get_my_organization(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Get current user's organization."""
    if not user.organization_id:
        raise HTTPException(404, "User not in an organization")
    
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    
    return org


@router.post("/invite-codes", response_model=schemas.InviteCodeRead)
def create_invite_code(
    data: schemas.InviteCodeCreate,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create an invite code for the current organization. Admin only."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can create invite codes")
    
    if not user.organization_id:
        raise HTTPException(400, "User not in an organization")
    
    # Generate unique code
    code = secrets.token_urlsafe(8)  # ~11 characters
    
    # Calculate expiration
    expires_at = None
    if data.expires_in_days:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)
    
    invite = InviteCode(
        code=code,
        organization_id=user.organization_id,
        created_by_user_id=user.id,
        max_uses=data.max_uses,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    
    return invite


@router.get("/invite-codes", response_model=list[schemas.InviteCodeRead])
def list_invite_codes(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """List invite codes for current organization. Admin only."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can view invite codes")
    
    if not user.organization_id:
        raise HTTPException(400, "User not in an organization")
    
    codes = db.query(InviteCode).filter(
        InviteCode.organization_id == user.organization_id
    ).order_by(InviteCode.created_at.desc()).all()
    
    return codes


@router.delete("/invite-codes/{code_id}")
def deactivate_or_delete_invite_code(
    code_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate an active invite code, or permanently delete a deactivated one. Admin only."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can manage invite codes")
    
    invite = db.query(InviteCode).filter(
        InviteCode.id == code_id,
        InviteCode.organization_id == user.organization_id
    ).first()
    
    if not invite:
        raise HTTPException(404, "Invite code not found")
    
    if invite.is_active:
        # Deactivate active invite
        invite.is_active = False
        db.commit()
        return {"message": "Invite code deactivated"}
    else:
        # Permanently delete already-deactivated invite
        db.delete(invite)
        db.commit()
        return {"message": "Invite code deleted"}

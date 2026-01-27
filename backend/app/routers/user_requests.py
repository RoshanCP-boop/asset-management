import secrets
import string
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app import schemas, models
from app.auth import require_roles, get_current_user, hash_password
from app.models import UserRole, User, UserRequest, UserRequestStatus


def generate_temp_password(length: int = 12) -> str:
    """Generate a random temporary password."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


router = APIRouter(prefix="/user-requests", tags=["user-requests"])


@router.post("", response_model=schemas.UserRequestRead)
def create_user_request(
    payload: schemas.UserRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only managers can create requests
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Only managers can create user requests")
    
    # Verify target is an admin
    target_admin = db.get(User, payload.target_admin_id)
    if not target_admin or target_admin.role != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Target must be an active admin")
    
    request = UserRequest(
        requested_name=payload.requested_name,
        requested_email=payload.requested_email,
        requested_role=payload.requested_role,
        requester_id=current_user.id,
        target_admin_id=payload.target_admin_id,
        status=UserRequestStatus.PENDING,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    
    return _enrich_request(request, db)


@router.get("", response_model=list[schemas.UserRequestRead])
def list_user_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Admins see requests targeted to them
    # Managers see their own requests
    if current_user.role == UserRole.ADMIN:
        requests = list(db.scalars(
            select(UserRequest)
            .where(UserRequest.target_admin_id == current_user.id)
            .order_by(UserRequest.created_at.desc())
        ))
    elif current_user.role == UserRole.MANAGER:
        requests = list(db.scalars(
            select(UserRequest)
            .where(UserRequest.requester_id == current_user.id)
            .order_by(UserRequest.created_at.desc())
        ))
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return [_enrich_request(r, db) for r in requests]


@router.get("/pending-count")
def get_pending_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.ADMIN:
        return {"count": 0}
    
    count = db.scalar(
        select(func.count(UserRequest.id))
        .where(UserRequest.target_admin_id == current_user.id)
        .where(UserRequest.status == UserRequestStatus.PENDING)
    ) or 0
    
    return {"count": count}


@router.post("/{request_id}/approve")
def approve_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can approve requests")
    
    request = db.get(UserRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.target_admin_id != current_user.id:
        raise HTTPException(status_code=403, detail="This request is not assigned to you")
    
    if request.status != UserRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request is not pending")
    
    # Generate a temporary password for the new user
    temp_password = generate_temp_password()
    
    # Create the user
    try:
        new_user = User(
            name=request.requested_name,
            email=request.requested_email,
            password_hash=hash_password(temp_password),
            role=request.requested_role,
            is_active=True,
            must_change_password=True,
        )
        db.add(new_user)
        db.flush()  # Get the user ID
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"A user with email {request.requested_email} already exists"
        )
    
    # Mark request as approved
    request.status = UserRequestStatus.APPROVED
    request.resolved_at = datetime.utcnow()
    db.commit()
    
    return {
        "message": f"User {request.requested_name} created successfully",
        "request_id": request_id,
        "user_id": new_user.id,
        "temporary_password": temp_password,
    }


@router.post("/{request_id}/deny")
def deny_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can deny requests")
    
    request = db.get(UserRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.target_admin_id != current_user.id:
        raise HTTPException(status_code=403, detail="This request is not assigned to you")
    
    if request.status != UserRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request is not pending")
    
    request.status = UserRequestStatus.DENIED
    request.resolved_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Request denied", "request_id": request_id}


def _enrich_request(request: UserRequest, db: Session) -> dict:
    requester = db.get(User, request.requester_id)
    return {
        "id": request.id,
        "requested_name": request.requested_name,
        "requested_email": request.requested_email,
        "requested_role": request.requested_role,
        "requester_id": request.requester_id,
        "target_admin_id": request.target_admin_id,
        "status": request.status.value,
        "created_at": request.created_at,
        "resolved_at": request.resolved_at,
        "requester_name": requester.name if requester else None,
        "requester_email": requester.email if requester else None,
    }

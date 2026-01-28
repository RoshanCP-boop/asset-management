from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app import schemas, crud
from app.auth import require_roles, get_current_user
from app.models import UserRole, User


router = APIRouter(prefix="/audit", tags=["audit"])


@router.get(
    "/summary",
    response_model=schemas.AuditSummary,
)
def get_audit_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR)),
):
    """Get summary statistics for audit dashboard. Admin and Auditor only."""
    return crud.get_audit_summary(db)


@router.get(
    "/user-events",
    response_model=list[schemas.UserEventRead],
)
def get_user_events(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR)),
):
    """Get user activity audit log. Admin and Auditor only."""
    return crud.list_user_events(db, limit=limit)


@router.get(
    "/asset-events",
    response_model=list[schemas.AssetEventAuditRead],
)
def get_asset_events(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR)),
):
    """Get asset activity audit log. Admin and Auditor only."""
    return crud.list_all_asset_events(db, limit=limit)

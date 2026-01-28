from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session, aliased

from app.db import get_db
from app import schemas, models, crud
from app.auth import get_current_user


class ApproveRequest(BaseModel):
    notes: Optional[str] = None
    assign_asset_id: Optional[int] = None  # Asset to assign to the requester

router = APIRouter(prefix="/asset-requests", tags=["asset-requests"])


@router.post("", response_model=schemas.AssetRequestRead, status_code=status.HTTP_201_CREATED)
def create_asset_request(
    payload: schemas.AssetRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new asset request. Any user can request assets."""
    # Validate request type
    if payload.request_type == "EXISTING_ASSET":
        if not payload.asset_id:
            raise HTTPException(400, "asset_id is required for EXISTING_ASSET requests")
        # Check asset exists and is available
        asset = db.get(models.Asset, payload.asset_id)
        if not asset:
            raise HTTPException(404, "Asset not found")
        if asset.status == models.AssetStatus.RETIRED:
            raise HTTPException(400, "Cannot request a retired asset")
    elif payload.request_type == "NEW_ASSET":
        if not payload.description:
            raise HTTPException(400, "description is required for NEW_ASSET requests")
    else:
        raise HTTPException(400, "Invalid request_type. Must be NEW_ASSET or EXISTING_ASSET")

    request = models.AssetRequest(
        request_type=models.AssetRequestType(payload.request_type),
        asset_type_requested=payload.asset_type_requested,
        description=payload.description,
        asset_id=payload.asset_id,
        requester_id=current_user.id,
        status=models.AssetRequestStatus.PENDING,
    )
    
    try:
        db.add(request)
        db.commit()
        db.refresh(request)
    except Exception:
        db.rollback()
        raise
    
    return _format_request(request, current_user.name, None, None)


@router.get("", response_model=list[schemas.AssetRequestRead])
def list_asset_requests(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    List asset requests.
    - Employees see only their own requests
    - Managers/Admins see all requests
    """
    Requester = aliased(models.User)
    ResolvedBy = aliased(models.User)
    
    stmt = (
        select(
            models.AssetRequest,
            Requester.name.label("requester_name"),
            ResolvedBy.name.label("resolved_by_name"),
            models.Asset.asset_tag.label("asset_tag"),
        )
        .outerjoin(Requester, models.AssetRequest.requester_id == Requester.id)
        .outerjoin(ResolvedBy, models.AssetRequest.resolved_by_id == ResolvedBy.id)
        .outerjoin(models.Asset, models.AssetRequest.asset_id == models.Asset.id)
    )
    
    # Employees only see their own requests
    if current_user.role == models.UserRole.EMPLOYEE:
        stmt = stmt.where(models.AssetRequest.requester_id == current_user.id)
    
    # Filter by status
    if status_filter:
        stmt = stmt.where(models.AssetRequest.status == status_filter)
    
    stmt = stmt.order_by(models.AssetRequest.created_at.desc())
    
    rows = db.execute(stmt).all()
    
    return [
        _format_request(req, requester_name, asset_tag, resolved_by_name)
        for req, requester_name, resolved_by_name, asset_tag in rows
    ]


@router.get("/my-requests", response_model=list[schemas.AssetRequestRead])
def list_my_asset_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get current user's asset requests."""
    Requester = aliased(models.User)
    ResolvedBy = aliased(models.User)
    
    stmt = (
        select(
            models.AssetRequest,
            Requester.name.label("requester_name"),
            ResolvedBy.name.label("resolved_by_name"),
            models.Asset.asset_tag.label("asset_tag"),
        )
        .outerjoin(Requester, models.AssetRequest.requester_id == Requester.id)
        .outerjoin(ResolvedBy, models.AssetRequest.resolved_by_id == ResolvedBy.id)
        .outerjoin(models.Asset, models.AssetRequest.asset_id == models.Asset.id)
        .where(models.AssetRequest.requester_id == current_user.id)
        .order_by(models.AssetRequest.created_at.desc())
    )
    
    rows = db.execute(stmt).all()
    
    return [
        _format_request(req, requester_name, asset_tag, resolved_by_name)
        for req, requester_name, resolved_by_name, asset_tag in rows
    ]


@router.get("/pending-count")
def get_pending_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get count of pending asset requests. Admins/Managers only."""
    if current_user.role not in (models.UserRole.ADMIN, models.UserRole.MANAGER):
        raise HTTPException(403, "Not authorized")
    
    count = db.query(models.AssetRequest).filter(
        models.AssetRequest.status == models.AssetRequestStatus.PENDING
    ).count()
    
    return {"count": count}


@router.get("/available-assets")
def get_available_assets(
    asset_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get assets available for assignment. Admins/Managers only."""
    if current_user.role not in (models.UserRole.ADMIN, models.UserRole.MANAGER):
        raise HTTPException(403, "Not authorized")
    
    # Get hardware that is IN_STOCK and not retired
    hardware_query = (
        select(models.Asset)
        .where(models.Asset.asset_type == models.AssetType.HARDWARE)
        .where(models.Asset.status == models.AssetStatus.IN_STOCK)
    )
    
    # Get software that has available seats (not fully utilized and not retired)
    software_query = (
        select(models.Asset)
        .where(models.Asset.asset_type == models.AssetType.SOFTWARE)
        .where(models.Asset.status != models.AssetStatus.RETIRED)
        .where(
            (models.Asset.seats_total.is_(None)) |  # Unlimited seats
            (func.coalesce(models.Asset.seats_used, 0) < models.Asset.seats_total)  # Has available seats
        )
    )
    
    if asset_type == "HARDWARE":
        assets = db.execute(hardware_query).scalars().all()
    elif asset_type == "SOFTWARE":
        assets = db.execute(software_query).scalars().all()
    else:
        hardware = db.execute(hardware_query).scalars().all()
        software = db.execute(software_query).scalars().all()
        assets = list(hardware) + list(software)
    
    return [
        {
            "id": a.id,
            "asset_tag": a.asset_tag,
            "asset_type": a.asset_type.value,
            "category": a.category,
            "subscription": a.subscription,
            "model": a.model,
            "seats_total": a.seats_total,
            "seats_used": a.seats_used,
        }
        for a in assets
    ]


@router.post("/{request_id}/approve")
def approve_asset_request(
    request_id: int,
    payload: ApproveRequest = Body(default=ApproveRequest()),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Approve an asset request and optionally assign an asset. Admins/Managers only."""
    if current_user.role not in (models.UserRole.ADMIN, models.UserRole.MANAGER):
        raise HTTPException(403, "Not authorized")
    
    request = db.get(models.AssetRequest, request_id)
    if not request:
        raise HTTPException(404, "Request not found")
    
    if request.status != models.AssetRequestStatus.PENDING:
        raise HTTPException(400, "Request has already been resolved")
    
    assigned_asset = None
    
    # If an asset is provided, assign it to the requester
    if payload.assign_asset_id:
        try:
            assigned_asset = crud.assign_asset(
                db=db,
                asset_id=payload.assign_asset_id,
                user_id=request.requester_id,
                actor_user_id=current_user.id,
                notes=f"Assigned via asset request #{request_id}"
            )
            # Store which asset was assigned
            request.asset_id = payload.assign_asset_id
        except ValueError as e:
            raise HTTPException(400, str(e))
    
    request.status = models.AssetRequestStatus.APPROVED
    request.resolved_by_id = current_user.id
    resolution_msg = payload.notes or "Approved"
    if assigned_asset:
        resolution_msg += f" - Assigned {assigned_asset.asset_tag}"
    request.resolution_notes = resolution_msg
    request.resolved_at = datetime.now(timezone.utc)
    
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    
    return {
        "message": "Request approved",
        "request_id": request_id,
        "assigned_asset_id": payload.assign_asset_id,
        "assigned_asset_tag": assigned_asset.asset_tag if assigned_asset else None,
    }


@router.post("/{request_id}/deny")
def deny_asset_request(
    request_id: int,
    notes: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Deny an asset request. Admins/Managers only."""
    if current_user.role not in (models.UserRole.ADMIN, models.UserRole.MANAGER):
        raise HTTPException(403, "Not authorized")
    
    request = db.get(models.AssetRequest, request_id)
    if not request:
        raise HTTPException(404, "Request not found")
    
    if request.status != models.AssetRequestStatus.PENDING:
        raise HTTPException(400, "Request has already been resolved")
    
    request.status = models.AssetRequestStatus.DENIED
    request.resolved_by_id = current_user.id
    request.resolution_notes = notes or "Denied"
    request.resolved_at = datetime.now(timezone.utc)
    
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    
    return {"message": "Request denied", "request_id": request_id}


def _format_request(
    request: models.AssetRequest,
    requester_name: str | None,
    asset_tag: str | None,
    resolved_by_name: str | None,
) -> dict:
    """Format an AssetRequest for API response."""
    return {
        "id": request.id,
        "request_type": request.request_type.value,
        "asset_type_requested": request.asset_type_requested.value if request.asset_type_requested else None,
        "description": request.description,
        "asset_id": request.asset_id,
        "requester_id": request.requester_id,
        "status": request.status.value,
        "resolved_by_id": request.resolved_by_id,
        "resolution_notes": request.resolution_notes,
        "created_at": request.created_at,
        "resolved_at": request.resolved_at,
        "requester_name": requester_name,
        "asset_tag": asset_tag,
        "resolved_by_name": resolved_by_name,
    }

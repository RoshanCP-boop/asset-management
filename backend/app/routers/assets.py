from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app import schemas, crud, models
from app.auth import get_current_user, require_roles
from app.models import UserRole, User


router = APIRouter(prefix="/assets", tags=["assets"])


@router.post(
    "",
    response_model=schemas.AssetRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))]
)
def create_asset(
    payload: schemas.AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return crud.create_asset(db, payload, actor_user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.get("", response_model=list[schemas.AssetRead])
def list_assets(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
):
    return crud.list_assets(
        db,
        status=status,
        current_user=current_user,
        limit=limit,
        offset=offset,
    )



@router.get("/{asset_id}", response_model=schemas.AssetDetailRead)
def get_asset(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    asset = crud.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # EMPLOYEE can only view assets assigned to them
    if current_user.role == UserRole.EMPLOYEE and asset.assigned_to_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this asset")

    return asset



@router.put(
    "/{asset_id}",
    response_model=schemas.AssetRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def update_asset(
    asset_id: int,
    payload: schemas.AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = crud.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if payload.asset_type and payload.asset_type != asset.asset_type:
        raise HTTPException(status_code=400, detail="Asset type cannot be changed")
    return crud.update_asset(db, asset, payload, actor_user_id=current_user.id)


class AssignRequest(schemas.APIModel):
    user_id: int
    notes: str | None = None


class ReturnRequest(schemas.APIModel):
    notes: str | None = None
    user_id: int | None = None  # For software: specify which user is returning the seat


@router.post(
    "/{asset_id}/assign",
    response_model=schemas.AssetRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))],
)
def assign_asset(
    asset_id: int,
    payload: schemas.AssetAssign,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    try:
        return crud.assign_asset(
            db=db,
            asset_id=asset_id,
            user_id=payload.user_id,
            notes=payload.notes,
            actor_user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.post(
    "/{asset_id}/return",
    response_model=schemas.AssetRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))],
)
def return_asset(
    asset_id: int,
    payload: ReturnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = crud.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        return crud.return_asset(
            db, 
            asset_id, 
            payload.notes, 
            actor_user_id=current_user.id,
            user_id=payload.user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.get("/{asset_id}/events", response_model=list[schemas.AssetEventRead])
def get_asset_events(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    asset = db.get(models.Asset, asset_id)

    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Access control:
    # - ADMIN/MANAGER/AUDITOR: can view any asset events
    # - EMPLOYEE: only if asset is assigned to them
    if current_user.role == UserRole.EMPLOYEE:
        if asset.assigned_to_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    return crud.list_asset_events(db, asset_id)
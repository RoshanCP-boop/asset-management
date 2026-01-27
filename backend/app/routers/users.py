from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select, or_, func

from app.db import get_db
from app import schemas, crud

from app.auth import require_roles, get_current_user
from app.models import UserRole, User, Asset, AssetEvent, AssetType, AssetEventType


router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=schemas.UserRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_user(db, payload)
    except IntegrityError as e:
        db.rollback()
        if "ix_users_email" in str(e) or "email" in str(e).lower():
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        raise HTTPException(status_code=400, detail="Failed to create user")


@router.get(
    "",
    response_model=list[schemas.UserRead],
    dependencies=[Depends(get_current_user)],  # any logged-in user can read
)
def list_users(db: Session = Depends(get_db)):
    return crud.list_users(db)


@router.get(
    "/{user_id}",
    response_model=schemas.UserRead,
    dependencies=[Depends(get_current_user)],
)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get(
    "/{user_id}/assets",
    response_model=list[schemas.AssetRead],
    dependencies=[Depends(get_current_user)],
)
def get_user_assets(user_id: int, db: Session = Depends(get_db)):
    """Get all assets assigned to a user (hardware by assigned_to_user_id, software by seat events)"""
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get hardware assets assigned to this user
    hardware_assets = list(db.scalars(
        select(Asset).where(
            Asset.assigned_to_user_id == user_id,
            Asset.asset_type == AssetType.HARDWARE
        )
    ).all())
    
    # Get software assets where user currently has a seat
    # A user has a seat if: count(ASSIGN to user) > count(RETURN from user) for that asset
    software_assets = []
    all_software = db.scalars(select(Asset).where(Asset.asset_type == AssetType.SOFTWARE)).all()
    
    for asset in all_software:
        # Count assigns to this user for this asset
        assigns = db.scalar(
            select(func.count()).select_from(AssetEvent).where(
                AssetEvent.asset_id == asset.id,
                AssetEvent.event_type == AssetEventType.ASSIGN,
                AssetEvent.to_user_id == user_id
            )
        ) or 0
        
        # Count returns from this user for this asset
        returns = db.scalar(
            select(func.count()).select_from(AssetEvent).where(
                AssetEvent.asset_id == asset.id,
                AssetEvent.event_type == AssetEventType.RETURN,
                AssetEvent.from_user_id == user_id
            )
        ) or 0
        
        if assigns > returns:
            software_assets.append(asset)
    
    return hardware_assets + software_assets


@router.get(
    "/{user_id}/events",
    response_model=list[schemas.AssetEventRead],
    dependencies=[Depends(get_current_user)],
)
def get_user_events(user_id: int, db: Session = Depends(get_db)):
    """Get all events related to a user (assigned to, assigned from, or performed by)"""
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    events = db.scalars(
        select(AssetEvent)
        .where(
            or_(
                AssetEvent.from_user_id == user_id,
                AssetEvent.to_user_id == user_id,
                AssetEvent.actor_user_id == user_id,
            )
        )
        .order_by(AssetEvent.timestamp.desc())
        .limit(100)
    ).all()
    return events


@router.delete(
    "/{user_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def deactivate_user(
    user_id: int,
    confirm: bool = Query(
        False,
        description="Set to true to confirm deactivation of an admin user",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deactivation (VERY IMPORTANT)
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot deactivate your own account",
        )

    # Extra confirmation if target user is ADMIN
    if user.role == UserRole.ADMIN and not confirm:
        raise HTTPException(
            status_code=400,
            detail="Deactivating an admin requires confirm=true",
        )

    # Return all assets assigned to this user
    returned_assets = []
    
    # 1. Return hardware assets assigned to this user
    hardware_assets = db.scalars(
        select(Asset).where(
            Asset.assigned_to_user_id == user_id,
            Asset.asset_type == AssetType.HARDWARE
        )
    ).all()
    
    for asset in hardware_assets:
        try:
            crud.return_asset(
                db,
                asset.id,
                notes=f"Auto-returned due to user deactivation",
                actor_user_id=current_user.id,
            )
            returned_assets.append(asset.asset_tag)
        except ValueError:
            pass  # Asset might already be returned
    
    # 2. Return software seats assigned to this user
    all_software = db.scalars(select(Asset).where(Asset.asset_type == AssetType.SOFTWARE)).all()
    
    for asset in all_software:
        # Count assigns to this user for this asset
        assigns = db.scalar(
            select(func.count()).select_from(AssetEvent).where(
                AssetEvent.asset_id == asset.id,
                AssetEvent.event_type == AssetEventType.ASSIGN,
                AssetEvent.to_user_id == user_id
            )
        ) or 0
        
        # Count returns from this user for this asset
        returns = db.scalar(
            select(func.count()).select_from(AssetEvent).where(
                AssetEvent.asset_id == asset.id,
                AssetEvent.event_type == AssetEventType.RETURN,
                AssetEvent.from_user_id == user_id
            )
        ) or 0
        
        # If user has seats, return them
        seats_to_return = assigns - returns
        for _ in range(seats_to_return):
            try:
                crud.return_asset(
                    db,
                    asset.id,
                    notes=f"Auto-returned due to user deactivation",
                    actor_user_id=current_user.id,
                    user_id=user_id,
                )
                if asset.asset_tag not in returned_assets:
                    returned_assets.append(asset.asset_tag)
            except ValueError:
                break  # No more seats to return

    user.is_active = False
    db.commit()

    return {
        "message": f"User {user.email} deactivated",
        "was_admin": user.role == UserRole.ADMIN,
        "returned_assets": returned_assets,
    }


@router.post(
    "/{user_id}/activate",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_active:
        raise HTTPException(status_code=400, detail="User is already active")

    user.is_active = True
    db.commit()

    return {
        "message": f"User {user.email} activated",
    }


@router.patch(
    "/{user_id}/role",
    response_model=schemas.UserRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def change_user_role(
    user_id: int,
    new_role: str = Query(..., description="New role for the user"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a user's role. Admin only. Cannot change own role."""
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent changing own role
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot change your own role",
        )

    # Validate the new role
    valid_roles = [r.value for r in UserRole]
    if new_role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}",
        )

    old_role = user.role.value
    user.role = UserRole(new_role)
    db.commit()
    db.refresh(user)

    return user
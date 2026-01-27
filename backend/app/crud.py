from sqlalchemy.orm import Session, aliased
from sqlalchemy import select

from app import models, schemas
from app.auth import hash_password
from app.models import UserRole, User, Asset


# ---------- Locations ----------
def create_location(db: Session, data: schemas.LocationCreate) -> models.Location:
    loc = models.Location(name=data.name)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


def list_locations(db: Session) -> list[models.Location]:
    return list(db.scalars(select(models.Location).order_by(models.Location.name)))


# ---------- Users ----------
def create_user(db: Session, data: schemas.UserCreate) -> models.User:
    user = models.User(name=data.name, email=data.email, password_hash=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session) -> list[models.User]:
    return list(db.scalars(select(models.User).order_by(models.User.name)))


def add_asset_event(
    db: Session,
    asset_id: int,
    event_type: models.AssetEventType,
    actor_user_id: int | None = None,
    notes: str | None = None,
    from_user_id: int | None = None,
    to_user_id: int | None = None,
    from_location_id: int | None = None,
    to_location_id: int | None = None,
):
    ev = models.AssetEvent(
        asset_id=asset_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        notes=notes,
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        from_location_id=from_location_id,
        to_location_id=to_location_id,
    )
    db.add(ev)
    return ev



# ---------- Assets ----------
def create_asset(db: Session, payload: schemas.AssetCreate, actor_user_id: int | None = None) -> models.Asset:
    asset = models.Asset(
        asset_tag=payload.asset_tag,
        asset_type=payload.asset_type,
        category=payload.category if payload.asset_type == models.AssetType.HARDWARE else None,
        subscription=payload.subscription if payload.asset_type == models.AssetType.SOFTWARE else None,

        model=payload.model,
        serial_number=payload.serial_number,
        purchase_date=payload.purchase_date,
        warranty_end=payload.warranty_end,
        renewal_date=payload.renewal_date,
        condition=payload.condition,
        status=payload.status,
        location_id=payload.location_id,
        notes=payload.notes,
    )

    db.add(asset)
    db.commit()
    db.refresh(asset)

    # ✅ ADD THIS BLOCK (event log)
    add_asset_event(
        db,
        asset_id=asset.id,
        event_type="CREATED",
        actor_user_id=actor_user_id,
        notes="Asset created",
    )

    return asset



def get_asset(db: Session, asset_id: int) -> models.Asset | None:
    return db.get(models.Asset, asset_id)


def list_assets(db: Session, status: str | None = None, current_user: User | None = None) -> list[Asset]:
    stmt = select(Asset).order_by(Asset.id.desc())

    if status:
        stmt = stmt.where(Asset.status == status)

    #Role-based filtering
    if current_user and current_user.role == UserRole.EMPLOYEE:
        stmt = stmt.where(Asset.assigned_to_user_id == current_user.id)

    return list(db.scalars(stmt))


def list_asset_events(db: Session, asset_id: int) -> list[dict]:
    FromUser = aliased(models.User)
    ToUser = aliased(models.User)
    ActorUser = aliased(models.User)

    stmt = (
        select(
            models.AssetEvent,
            FromUser.name.label("from_user_name"),
            ToUser.name.label("to_user_name"),
            ActorUser.name.label("actor_user_name"),
        )
        .outerjoin(FromUser, models.AssetEvent.from_user_id == FromUser.id)
        .outerjoin(ToUser, models.AssetEvent.to_user_id == ToUser.id)
        .outerjoin(ActorUser, models.AssetEvent.actor_user_id == ActorUser.id)
        .where(models.AssetEvent.asset_id == asset_id)
        .order_by(models.AssetEvent.timestamp.desc())
    )

    rows = db.execute(stmt).all()

    out: list[dict] = []
    for ev, from_name, to_name, actor_name in rows:
        out.append(
            {
                "id": ev.id,
                "asset_id": ev.asset_id,
                "event_type": ev.event_type,
                "from_user_id": ev.from_user_id,
                "to_user_id": ev.to_user_id,
                "from_location_id": ev.from_location_id,
                "to_location_id": ev.to_location_id,
                "actor_user_id": ev.actor_user_id,
                "timestamp": ev.timestamp,
                "notes": ev.notes,
                "from_user_name": from_name,
                "to_user_name": to_name,
                "actor_user_name": actor_name,
            }
        )
    return out




def update_asset(db: Session, asset: models.Asset, data: schemas.AssetUpdate) -> models.Asset:
    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(asset, k, v)

    db.add(asset)

    event = models.AssetEvent(
        asset_id=asset.id,
        event_type=models.AssetEventType.UPDATE,
        notes="Asset updated",
    )
    db.add(event)

    db.commit()
    db.refresh(asset)
    return asset


# ---------- Assign / Return ----------
def assign_asset(
    db: Session,
    asset_id: int,
    user_id: int,
    actor_user_id: int | None = None,
    notes: str | None = None,
):
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise ValueError("Asset not found")

    # Prevent assigning retired assets
    if asset.status == models.AssetStatus.RETIRED:
        raise ValueError("Cannot assign a retired asset.")

    user = db.get(models.User, user_id)
    if not user:
        raise ValueError("User not found")

    # Handle SOFTWARE (subscription) differently - allows multiple assignments
    if asset.asset_type == models.AssetType.SOFTWARE:
        # Check seat availability
        seats_total = asset.seats_total or 0
        seats_used = asset.seats_used or 0
        
        if seats_total > 0 and seats_used >= seats_total:
            raise ValueError(f"No seats available. All {seats_total} seats are in use.")
        
        # Increment seats_used
        asset.seats_used = seats_used + 1
        asset.status = models.AssetStatus.ASSIGNED
        
        ev = models.AssetEvent(
            asset_id=asset_id,
            event_type=models.AssetEventType.ASSIGN,
            actor_user_id=actor_user_id,
            to_user_id=user_id,
            notes=notes or f"Assigned seat to {user.name} ({asset.seats_used}/{seats_total or '∞'} seats used)",
        )
    else:
        # HARDWARE - original logic (single assignment)
        if asset.assigned_to_user_id is not None:
            current_user = db.get(models.User, asset.assigned_to_user_id)
            current_name = current_user.name if current_user else f"User #{asset.assigned_to_user_id}"
            raise ValueError(f"Asset is already assigned to {current_name}. Return it first before reassigning.")

        asset.assigned_to_user_id = user_id
        asset.status = models.AssetStatus.ASSIGNED

        ev = models.AssetEvent(
            asset_id=asset_id,
            event_type=models.AssetEventType.ASSIGN,
            actor_user_id=actor_user_id,
            to_user_id=user_id,
            notes=notes or f"Assigned to {user.name}",
        )

    db.add(ev)
    db.commit()
    db.refresh(asset)
    return asset



def return_asset(
    db: Session,
    asset_id: int,
    notes: str | None = None,
    actor_user_id: int | None = None,
    user_id: int | None = None,  # For software: specify which user is returning
):
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise ValueError("Asset not found")

    # Handle SOFTWARE (subscription) differently
    if asset.asset_type == models.AssetType.SOFTWARE:
        seats_used = asset.seats_used or 0
        
        if seats_used <= 0:
            raise ValueError("No seats are currently in use.")
        
        # Decrement seats_used
        asset.seats_used = seats_used - 1
        
        # Update status based on remaining seats
        if asset.seats_used == 0:
            asset.status = models.AssetStatus.IN_STOCK
        
        # Get user name for notes
        user_name = None
        if user_id:
            user = db.get(models.User, user_id)
            if user:
                user_name = user.name
        
        seats_total = asset.seats_total or 0
        return_note = f"Returned seat from {user_name or 'user'} ({asset.seats_used}/{seats_total or '∞'} seats used)"
        if notes:
            return_note = f"{return_note}. {notes}"
        
        add_asset_event(
            db,
            asset_id=asset_id,
            event_type=models.AssetEventType.RETURN,
            from_user_id=user_id,
            actor_user_id=actor_user_id,
            notes=return_note,
        )
    else:
        # HARDWARE - original logic
        previous_user_id = asset.assigned_to_user_id  # ✅ capture before clearing
        
        # Get the previous user's name for the notes
        previous_user_name = None
        if previous_user_id:
            previous_user = db.get(models.User, previous_user_id)
            if previous_user:
                previous_user_name = previous_user.name

        asset.assigned_to_user_id = None
        asset.status = models.AssetStatus.IN_STOCK

        # Build notes with "Returned from [name]"
        return_note = f"Returned from {previous_user_name}" if previous_user_name else "Returned"
        if notes:
            return_note = f"{return_note}. {notes}"

        add_asset_event(
            db,
            asset_id=asset_id,
            event_type=models.AssetEventType.RETURN,
            from_user_id=previous_user_id,
            actor_user_id=actor_user_id,
            notes=return_note,
        )

    db.commit()
    db.refresh(asset)
    return asset





def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

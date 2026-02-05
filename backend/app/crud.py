from sqlalchemy.orm import Session, aliased, joinedload
from sqlalchemy import select, func, case, or_

from app import models, schemas
from app.auth import hash_password
from app.models import UserRole, User, Asset


# ---------- Locations ----------
def create_location(db: Session, data: schemas.LocationCreate) -> models.Location:
    loc = models.Location(name=data.name)
    try:
        db.add(loc)
        db.commit()
        db.refresh(loc)
        return loc
    except Exception:
        db.rollback()
        raise


def list_locations(db: Session) -> list[models.Location]:
    return list(db.scalars(select(models.Location).order_by(models.Location.name)))


# ---------- Users ----------
def create_user(db: Session, data: schemas.UserCreate) -> models.User:
    user = models.User(name=data.name, email=data.email, password_hash=hash_password(data.password), role=data.role)
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise


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
def create_asset(db: Session, payload: schemas.AssetCreate, actor_user_id: int | None = None, organization_id: int | None = None) -> models.Asset:
    # Duplicate checks scoped to organization for clearer errors
    # Build org filter
    if organization_id is not None:
        org_filter = models.Asset.organization_id == organization_id
    else:
        org_filter = models.Asset.organization_id.is_(None)
    
    existing_tag = db.scalar(
        select(models.Asset.id).where(
            models.Asset.asset_tag == payload.asset_tag,
            org_filter
        )
    )
    if existing_tag:
        raise ValueError("Asset tag already exists")
    if payload.serial_number:
        existing_serial = db.scalar(
            select(models.Asset.id).where(
                models.Asset.serial_number == payload.serial_number,
                org_filter
            )
        )
        if existing_serial:
            raise ValueError("Serial number already exists")

    asset = models.Asset(
        asset_tag=payload.asset_tag,
        asset_type=payload.asset_type,
        category=payload.category if payload.asset_type == models.AssetType.HARDWARE else None,
        subscription=payload.subscription if payload.asset_type == models.AssetType.SOFTWARE else None,

        manufacturer=payload.manufacturer if payload.asset_type == models.AssetType.HARDWARE else None,
        model=payload.model,
        serial_number=payload.serial_number,
        purchase_date=payload.purchase_date,
        warranty_start=payload.warranty_start,
        warranty_end=payload.warranty_end,
        renewal_date=payload.renewal_date,
        seats_total=payload.seats_total,
        seats_used=payload.seats_used,
        condition=payload.condition,
        status=payload.status,
        location_id=payload.location_id,
        notes=payload.notes,
        organization_id=organization_id,
    )

    try:
        db.add(asset)
        db.flush()  # get asset.id before logging event

        add_asset_event(
            db,
            asset_id=asset.id,
            event_type=models.AssetEventType.CREATE,
            actor_user_id=actor_user_id,
            notes="Asset created",
        )

        db.commit()
        db.refresh(asset)
        return asset
    except Exception:
        db.rollback()
        raise



def get_asset(db: Session, asset_id: int) -> models.Asset | None:
    stmt = select(models.Asset).where(models.Asset.id == asset_id).options(joinedload(models.Asset.location))
    return db.execute(stmt).scalar_one_or_none()


def list_assets(
    db: Session,
    status: str | None = None,
    current_user: User | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Asset]:
    stmt = select(Asset).order_by(Asset.id.desc())

    # Organization filtering - always filter by user's org
    if current_user:
        if current_user.organization_id:
            stmt = stmt.where(Asset.organization_id == current_user.organization_id)
        else:
            # User has no org - only show assets with no org (personal assets)
            stmt = stmt.where(Asset.organization_id.is_(None))

    if status:
        stmt = stmt.where(Asset.status == status)

    # Role-based filtering
    if current_user and current_user.role == UserRole.EMPLOYEE:
        stmt = stmt.where(Asset.assigned_to_user_id == current_user.id)

    if limit is not None:
        stmt = stmt.offset(offset).limit(limit)

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


def list_all_asset_events(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
    event_type: str | None = None,
    organization_id: int | None = None,
) -> list[dict]:
    """Get all asset events across all assets, for audit purposes with optional filters."""
    
    FromUser = aliased(models.User)
    ToUser = aliased(models.User)
    ActorUser = aliased(models.User)
    FromLocation = aliased(models.Location)
    ToLocation = aliased(models.Location)

    stmt = (
        select(
            models.AssetEvent,
            models.Asset.asset_tag,
            FromUser.name.label("from_user_name"),
            ToUser.name.label("to_user_name"),
            ActorUser.name.label("actor_user_name"),
            FromLocation.name.label("from_location_name"),
            ToLocation.name.label("to_location_name"),
        )
        .join(models.Asset, models.AssetEvent.asset_id == models.Asset.id)
        .outerjoin(FromUser, models.AssetEvent.from_user_id == FromUser.id)
        .outerjoin(ToUser, models.AssetEvent.to_user_id == ToUser.id)
        .outerjoin(ActorUser, models.AssetEvent.actor_user_id == ActorUser.id)
        .outerjoin(FromLocation, models.AssetEvent.from_location_id == FromLocation.id)
        .outerjoin(ToLocation, models.AssetEvent.to_location_id == ToLocation.id)
    )
    
    # Filter by organization (via asset's org)
    if organization_id is not None:
        stmt = stmt.where(models.Asset.organization_id == organization_id)
    else:
        stmt = stmt.where(models.Asset.organization_id.is_(None))
    
    # Filter by event type
    if event_type:
        stmt = stmt.where(models.AssetEvent.event_type == event_type)
    
    # Filter by search term (asset tag, user names, location names, or notes)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                models.Asset.asset_tag.ilike(search_pattern),
                FromUser.name.ilike(search_pattern),
                ToUser.name.ilike(search_pattern),
                ActorUser.name.ilike(search_pattern),
                FromLocation.name.ilike(search_pattern),
                ToLocation.name.ilike(search_pattern),
                models.AssetEvent.notes.ilike(search_pattern),
            )
        )
    
    stmt = stmt.order_by(models.AssetEvent.timestamp.desc()).offset(offset).limit(limit)

    rows = db.execute(stmt).all()

    out: list[dict] = []
    for ev, asset_tag, from_name, to_name, actor_name, from_loc_name, to_loc_name in rows:
        out.append(
            {
                "id": ev.id,
                "asset_id": ev.asset_id,
                "asset_tag": asset_tag,
                "event_type": ev.event_type.value,
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
                "from_location_name": from_loc_name,
                "to_location_name": to_loc_name,
            }
        )
    return out


def update_asset(
    db: Session,
    asset: models.Asset,
    data: schemas.AssetUpdate,
    actor_user_id: int | None = None,
) -> models.Asset:
    updates = data.model_dump(exclude_unset=True)
    
    # Track changes for audit log
    changes = []
    location_change = None  # Track location change separately for MOVE event
    
    for k, v in updates.items():
        old_value = getattr(asset, k)
        if old_value != v:
            # Special handling for location_id - create MOVE event
            if k == "location_id":
                location_change = {
                    "from_location_id": old_value,
                    "to_location_id": v,
                    "from_name": _get_location_name(db, old_value),
                    "to_name": _get_location_name(db, v),
                }
            else:
                # Format the field name nicely
                field_name = k.replace("_", " ").title()
                # Format values for display
                old_display = _format_value_for_log(old_value)
                new_display = _format_value_for_log(v)
                changes.append(f"{field_name}: {old_display} → {new_display}")
            
            setattr(asset, k, v)

    # Only create events if there were actual changes
    if not changes and not location_change:
        return asset

    try:
        db.add(asset)

        # Create MOVE event for location changes
        if location_change:
            move_notes = f"Moved from {location_change['from_name']} to {location_change['to_name']}"
            move_event = models.AssetEvent(
                asset_id=asset.id,
                event_type=models.AssetEventType.MOVE,
                actor_user_id=actor_user_id,
                from_location_id=location_change["from_location_id"],
                to_location_id=location_change["to_location_id"],
                notes=move_notes,
            )
            db.add(move_event)

        # Create UPDATE event for other changes
        if changes:
            notes = "; ".join(changes)
            update_event = models.AssetEvent(
                asset_id=asset.id,
                event_type=models.AssetEventType.UPDATE,
                actor_user_id=actor_user_id,
                notes=notes,
            )
            db.add(update_event)

        db.commit()
        db.refresh(asset)
        return asset
    except Exception:
        db.rollback()
        raise


def _format_value_for_log(value) -> str:
    """Format a value for display in audit log."""
    if value is None:
        return "(empty)"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if hasattr(value, "value"):  # Enum
        return str(value.value).replace("_", " ")
    return str(value)


def _get_location_name(db: Session, location_id: int | None) -> str:
    """Get location name by ID for audit logging."""
    if location_id is None:
        return "(none)"
    location = db.get(models.Location, location_id)
    return location.name if location else f"(unknown #{location_id})"


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

    try:
        db.add(ev)
        db.commit()
        db.refresh(asset)
        return asset
    except Exception:
        db.rollback()
        raise



def return_asset(
    db: Session,
    asset_id: int,
    notes: str | None = None,
    actor_user_id: int | None = None,
    user_id: int | None = None,  # For software: specify which user is returning
    condition: str | None = None,  # For hardware: update condition on return
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
        
        # Update condition if provided
        if condition:
            try:
                asset.condition = models.AssetCondition(condition)
            except ValueError:
                pass  # Invalid condition value, ignore

        # Build notes with "Returned from [name]"
        return_note = f"Returned from {previous_user_name}" if previous_user_name else "Returned"
        if condition:
            return_note = f"{return_note} (Condition: {condition})"
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

    try:
        db.commit()
        db.refresh(asset)
        return asset
    except Exception:
        db.rollback()
        raise





def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()


# ---------- User Events (Audit Log) ----------
def add_user_event(
    db: Session,
    event_type: models.UserEventType,
    target_user_id: int | None = None,
    actor_user_id: int | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    notes: str | None = None,
) -> models.UserEvent:
    """Log a user-related event for audit purposes."""
    event = models.UserEvent(
        event_type=event_type,
        target_user_id=target_user_id,
        actor_user_id=actor_user_id,
        old_value=old_value,
        new_value=new_value,
        notes=notes,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_user_events(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
    event_type: str | None = None,
    organization_id: int | None = None,
) -> list[schemas.UserEventRead]:
    """Get recent user events with resolved user names and optional filters."""
    
    TargetUser = aliased(models.User)
    ActorUser = aliased(models.User)
    
    stmt = (
        select(
            models.UserEvent,
            TargetUser.name.label("target_user_name"),
            ActorUser.name.label("actor_user_name"),
        )
        .outerjoin(TargetUser, models.UserEvent.target_user_id == TargetUser.id)
        .outerjoin(ActorUser, models.UserEvent.actor_user_id == ActorUser.id)
    )
    
    # Filter by organization (via target user's org)
    if organization_id is not None:
        stmt = stmt.where(TargetUser.organization_id == organization_id)
    else:
        stmt = stmt.where(TargetUser.organization_id.is_(None))
    
    # Filter by event type
    if event_type:
        stmt = stmt.where(models.UserEvent.event_type == event_type)
    
    # Filter by search term (target user name, actor name, or notes)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                TargetUser.name.ilike(search_pattern),
                ActorUser.name.ilike(search_pattern),
                models.UserEvent.notes.ilike(search_pattern),
            )
        )
    
    stmt = stmt.order_by(models.UserEvent.timestamp.desc()).offset(offset).limit(limit)
    
    results = db.execute(stmt).all()
    
    events = []
    for row in results:
        event = row[0]
        events.append(schemas.UserEventRead(
            id=event.id,
            event_type=event.event_type.value,
            timestamp=event.timestamp,
            target_user_id=event.target_user_id,
            actor_user_id=event.actor_user_id,
            old_value=event.old_value,
            new_value=event.new_value,
            notes=event.notes,
            target_user_name=row[1],
            actor_user_name=row[2],
        ))
    
    return events


def get_audit_summary(db: Session, organization_id: int | None = None) -> schemas.AuditSummary:
    """Get summary statistics for audit dashboard."""
    from datetime import datetime, timedelta, timezone
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    
    # Build org filter for users
    if organization_id is not None:
        user_org_filter = models.User.organization_id == organization_id
    else:
        user_org_filter = models.User.organization_id.is_(None)
    
    # User counts (single query)
    user_counts = db.execute(
        select(
            func.count(models.User.id),
            func.sum(case((models.User.is_active == True, 1), else_=0)),
        ).where(user_org_filter)
    ).one()
    total_users = user_counts[0] or 0
    active_users = user_counts[1] or 0
    inactive_users = total_users - active_users

    # Asset counts (single query)
    # For software: use "effective status" based on seat utilization (matching frontend logic)
    # - IN_STOCK if seats_used < seats_total (or seats_total is null/seats not configured)
    # - ASSIGNED only if seats_used >= seats_total (fully utilized)
    
    # Build org filter for assets
    if organization_id is not None:
        asset_org_filter = models.Asset.organization_id == organization_id
    else:
        asset_org_filter = models.Asset.organization_id.is_(None)
    
    # Helper: coalesce seats_used to 0 if null
    seats_used_val = func.coalesce(models.Asset.seats_used, 0)
    
    asset_counts = db.execute(
        select(
            func.count(models.Asset.id),
            func.sum(case((models.Asset.asset_type == models.AssetType.HARDWARE, 1), else_=0)),
            func.sum(case((models.Asset.asset_type == models.AssetType.SOFTWARE, 1), else_=0)),
            # Assigned: hardware with ASSIGNED status + software fully utilized
            func.sum(case(
                (
                    (models.Asset.asset_type == models.AssetType.HARDWARE) & 
                    (models.Asset.status == models.AssetStatus.ASSIGNED),
                    1
                ),
                (
                    (models.Asset.asset_type == models.AssetType.SOFTWARE) & 
                    (models.Asset.status != models.AssetStatus.RETIRED) &
                    (models.Asset.seats_total.isnot(None)) &
                    (seats_used_val >= models.Asset.seats_total),
                    1
                ),
                else_=0
            )),
            # In Stock: hardware with IN_STOCK status + software with available capacity
            func.sum(case(
                (
                    (models.Asset.asset_type == models.AssetType.HARDWARE) & 
                    (models.Asset.status == models.AssetStatus.IN_STOCK),
                    1
                ),
                (
                    (models.Asset.asset_type == models.AssetType.SOFTWARE) & 
                    (models.Asset.status != models.AssetStatus.RETIRED) &
                    (
                        (models.Asset.seats_total.is_(None)) |  # No seats configured = available
                        (seats_used_val < models.Asset.seats_total)  # Has available seats
                    ),
                    1
                ),
                else_=0
            )),
            func.sum(case((models.Asset.status == models.AssetStatus.RETIRED, 1), else_=0)),
            # Software seat counts (keep for potential future use)
            func.coalesce(func.sum(
                case((models.Asset.asset_type == models.AssetType.SOFTWARE, models.Asset.seats_total), else_=0)
            ), 0),
            func.coalesce(func.sum(
                case((models.Asset.asset_type == models.AssetType.SOFTWARE, models.Asset.seats_used), else_=0)
            ), 0),
        ).where(asset_org_filter)
    ).one()
    total_assets = asset_counts[0] or 0
    hardware_count = asset_counts[1] or 0
    software_count = asset_counts[2] or 0
    assigned_assets = asset_counts[3] or 0
    in_stock_assets = asset_counts[4] or 0
    retired_assets = asset_counts[5] or 0
    software_seats_total = int(asset_counts[6] or 0)
    software_seats_used = int(asset_counts[7] or 0)
    software_seats_available = software_seats_total - software_seats_used

    # User event counts (single query) - filter by target user's org
    user_event_counts = db.execute(
        select(
            func.sum(case((models.UserEvent.timestamp >= today_start, 1), else_=0)),
            func.sum(case((models.UserEvent.timestamp >= week_start, 1), else_=0)),
        )
        .select_from(models.UserEvent)
        .join(models.User, models.UserEvent.target_user_id == models.User.id)
        .where(user_org_filter)
    ).one()
    user_events_today = user_event_counts[0] or 0
    user_events_week = user_event_counts[1] or 0

    # Asset event counts (single query) - filter by asset's org
    asset_event_counts = db.execute(
        select(
            func.sum(case((models.AssetEvent.timestamp >= today_start, 1), else_=0)),
            func.sum(case((models.AssetEvent.timestamp >= week_start, 1), else_=0)),
        )
        .select_from(models.AssetEvent)
        .join(models.Asset, models.AssetEvent.asset_id == models.Asset.id)
        .where(asset_org_filter)
    ).one()
    asset_events_today = asset_event_counts[0] or 0
    asset_events_week = asset_event_counts[1] or 0
    
    return schemas.AuditSummary(
        total_users=total_users,
        active_users=active_users,
        inactive_users=inactive_users,
        total_assets=total_assets,
        hardware_count=hardware_count,
        software_count=software_count,
        assigned_assets=assigned_assets,
        in_stock_assets=in_stock_assets,
        retired_assets=retired_assets,
        software_seats_total=software_seats_total,
        software_seats_used=software_seats_used,
        software_seats_available=software_seats_available,
        user_events_today=user_events_today,
        user_events_week=user_events_week,
        asset_events_today=asset_events_today,
        asset_events_week=asset_events_week,
    )

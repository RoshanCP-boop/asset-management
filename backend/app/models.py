from datetime import datetime, date, timezone
from enum import Enum


def utcnow() -> datetime:
    """Return current UTC time as timezone-aware datetime."""
    return datetime.now(timezone.utc)

from sqlalchemy import (
    String, Integer, Boolean, Date, DateTime, Text, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class AssetType(str, Enum):
    HARDWARE = "HARDWARE"
    SOFTWARE = "SOFTWARE"


class AssetStatus(str, Enum):
    IN_STOCK = "IN_STOCK"
    ASSIGNED = "ASSIGNED"
    IN_REPAIR = "IN_REPAIR"
    RETIRED = "RETIRED"


class AssetCondition(str, Enum):
    NEW = "NEW"
    GOOD = "GOOD"
    FAIR = "FAIR"
    DAMAGED = "DAMAGED"


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)

    assets = relationship("Asset", back_populates="location")


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"
    AUDITOR = "AUDITOR"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole,  name="userrole"), default=UserRole.EMPLOYEE, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_assets = relationship("Asset", back_populates="assigned_to")

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    

    asset_tag: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    asset_type: Mapped[AssetType] = mapped_column(SAEnum(AssetType), index=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    subscription: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)

    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Hardware warranty
    warranty_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_extended_months: Mapped[int] = mapped_column(Integer, default=0)  # Total months extended

    # Software renewal
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    seats_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seats_used: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[AssetStatus] = mapped_column(SAEnum(AssetStatus), index=True)
    condition: Mapped[AssetCondition] = mapped_column(SAEnum(AssetCondition), index=True)

    owner_org: Mapped[str] = mapped_column(String(200), default="Docket")

    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    assigned_to_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    location = relationship("Location", back_populates="assets")
    assigned_to = relationship("User", back_populates="assigned_assets")

    events = relationship("AssetEvent", back_populates="asset", cascade="all, delete-orphan")


class AssetEventType(str, Enum):
    CREATE = "CREATE"
    ASSIGN = "ASSIGN"
    RETURN = "RETURN"
    MOVE = "MOVE"
    UPDATE = "UPDATE"
    REPAIR = "REPAIR"
    RETIRE = "RETIRE"


class AssetEvent(Base):
    __tablename__ = "asset_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)

    event_type: Mapped[AssetEventType] = mapped_column(SAEnum(AssetEventType), index=True)

    from_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    to_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    from_location_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    to_location_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True
    )

    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    asset = relationship("Asset", back_populates="events")


class UserRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"


class UserRequest(Base):
    __tablename__ = "user_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # Requested user details
    requested_name: Mapped[str] = mapped_column(String(200))
    requested_email: Mapped[str] = mapped_column(String(255))
    requested_role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="userrole", create_constraint=False))
    
    # Who made the request
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    
    # Which admin it's assigned to
    target_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    
    status: Mapped[UserRequestStatus] = mapped_column(
        SAEnum(UserRequestStatus, name="userrequeststatus"),
        default=UserRequestStatus.PENDING,
        index=True
    )
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    requester = relationship("User", foreign_keys=[requester_id])
    target_admin = relationship("User", foreign_keys=[target_admin_id])


class UserEventType(str, Enum):
    USER_CREATED = "USER_CREATED"
    USER_DEACTIVATED = "USER_DEACTIVATED"
    USER_REACTIVATED = "USER_REACTIVATED"
    ROLE_CHANGED = "ROLE_CHANGED"
    REQUEST_CREATED = "REQUEST_CREATED"
    REQUEST_APPROVED = "REQUEST_APPROVED"
    REQUEST_DENIED = "REQUEST_DENIED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"


class UserEvent(Base):
    """Audit log for user-related actions."""
    __tablename__ = "user_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    event_type: Mapped[UserEventType] = mapped_column(
        SAEnum(UserEventType, name="usereventtype"),
        index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    
    # The user this event is about (can be null for request events)
    target_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # Who performed the action
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # For tracking changes
    old_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    new_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    # Additional context
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationships
    target_user = relationship("User", foreign_keys=[target_user_id])
    actor_user = relationship("User", foreign_keys=[actor_user_id])

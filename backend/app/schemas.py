from __future__ import annotations
from datetime import date, datetime
from typing import Optional, List


from pydantic import BaseModel, EmailStr, Field, computed_field, ConfigDict, model_validator
from app import models

from app.models import AssetType, AssetStatus, AssetCondition, AssetEventType, UserRole


# ---- Shared base config (Pydantic v2) ----
class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes = True)


# ---- Location ----
class LocationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)


class LocationRead(APIModel):
    id: int
    name: str


# ---- User ----
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8)
    role: UserRole = UserRole.EMPLOYEE

class UserRead(APIModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    is_active: bool

    @computed_field
    @property
    def status(self) -> str:
        return "ACTIVE" if self.is_active else "DEACTIVATED"

    class Config:
        from_attributes = True 
        
# ---- Asset ----
class AssetCreate(BaseModel):
    asset_tag: str = Field(..., min_length=3, max_length=50)
    asset_type: AssetType

    # Hardware only
    category: str | None = Field(default=None, min_length=2, max_length=100)

    # Software only
    subscription: str | None = Field(default=None, min_length=2, max_length=200)

    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None

    purchase_date: Optional[date] = None
    warranty_start: Optional[date] = None
    warranty_end: Optional[date] = None
    warranty_extended_months: int = 0
    renewal_date: Optional[date] = None

    seats_total: Optional[int] = Field(default=None, ge=0)
    seats_used: Optional[int] = Field(default=None, ge=0)

    status: AssetStatus = AssetStatus.IN_STOCK
    condition: AssetCondition = AssetCondition.GOOD

    owner_org: str = "Docket"
    location_id: Optional[int] = None
    assigned_to_user_id: Optional[int] = None
    notes: Optional[str] = None


    @model_validator(mode="after")
    def validate_hw_sw_fields(self) -> "AssetCreate":
        if self.asset_type == AssetType.HARDWARE:
            if not self.category:
                raise ValueError("category is required for HARDWARE assets")
            if self.subscription:
                raise ValueError("subscription must be empty for HARDWARE assets")

        elif self.asset_type == AssetType.SOFTWARE:
            if not self.subscription:
                raise ValueError("subscription is required for SOFTWARE assets")
            if self.category:
                raise ValueError("category must be empty for SOFTWARE assets")

        return self



class AssetUpdate(BaseModel):
    # all optional, because PATCH-like update (we'll use PUT but treat as partial)
    asset_type: Optional[AssetType] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None

    purchase_date: Optional[date] = None
    warranty_start: Optional[date] = None
    warranty_end: Optional[date] = None
    warranty_extended_months: Optional[int] = None
    renewal_date: Optional[date] = None

    seats_total: Optional[int] = Field(default=None, ge=0)
    seats_used: Optional[int] = Field(default=None, ge=0)

    status: Optional[AssetStatus] = None
    condition: Optional[AssetCondition] = None

    owner_org: Optional[str] = None
    location_id: Optional[int] = None
    assigned_to_user_id: Optional[int] = None

    notes: Optional[str] = None


class AssetRead(APIModel):
    id: int
    asset_tag: str
    asset_type: AssetType
    category: str | None = None
    subscription: str | None = None

    manufacturer: Optional[str]
    model: Optional[str]
    serial_number: Optional[str]

    purchase_date: Optional[date]
    warranty_start: Optional[date]
    warranty_end: Optional[date]
    warranty_extended_months: int
    renewal_date: Optional[date]

    seats_total: Optional[int]
    seats_used: Optional[int]

    status: AssetStatus
    condition: AssetCondition

    owner_org: str
    location_id: Optional[int]
    location: Optional[LocationRead] = None
    assigned_to_user_id: Optional[int]

    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


# ---- Asset Events (history) ----
class AssetEventRead(APIModel):
    id: int
    asset_id: int
    event_type: models.AssetEventType
    from_user_id: int | None = None
    to_user_id: int | None = None
    actor_user_id: int | None = None
    timestamp: datetime
    notes: str | None = None

    from_user_name: str | None = None
    to_user_name: str | None = None
    actor_user_name: str | None = None


class AssetEventAuditRead(APIModel):
    """Asset event with asset_tag included for audit purposes."""
    id: int
    asset_id: int
    asset_tag: str
    event_type: str
    from_user_id: int | None = None
    to_user_id: int | None = None
    from_location_id: int | None = None
    to_location_id: int | None = None
    actor_user_id: int | None = None
    timestamp: datetime
    notes: str | None = None

    from_user_name: str | None = None
    to_user_name: str | None = None
    actor_user_name: str | None = None
    from_location_name: str | None = None
    to_location_name: str | None = None


# ---- Audit Dashboard ----
class AuditSummary(APIModel):
    """Summary statistics for audit dashboard."""
    total_users: int
    active_users: int
    inactive_users: int
    total_assets: int
    hardware_count: int
    software_count: int
    assigned_assets: int
    in_stock_assets: int
    retired_assets: int
    # Software seat-level counts
    software_seats_total: int
    software_seats_used: int
    software_seats_available: int
    user_events_today: int
    user_events_week: int
    asset_events_today: int
    asset_events_week: int



class AssetDetailRead(AssetRead):
    events: List[AssetEventRead] = []

class AssetAssign(BaseModel):
    user_id: int
    notes: str | None = None
    
class AssetReturn(BaseModel):
    notes: str | None = None


# ---- User Requests ----
class UserRequestCreate(BaseModel):
    requested_name: str
    requested_email: str
    requested_role: UserRole
    target_admin_id: int


class UserRequestRead(APIModel):
    id: int
    requested_name: str
    requested_email: str
    requested_role: UserRole
    requester_id: int
    target_admin_id: int
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    
    # Include requester info
    requester_name: str | None = None
    requester_email: str | None = None


# ---- User Events (audit log) ----
class UserEventRead(APIModel):
    id: int
    event_type: str
    timestamp: datetime
    target_user_id: int | None = None
    actor_user_id: int | None = None
    old_value: str | None = None
    new_value: str | None = None
    notes: str | None = None
    
    # Resolved names for display
    target_user_name: str | None = None
    actor_user_name: str | None = None


# ---- Asset Requests ----
class AssetRequestCreate(BaseModel):
    request_type: str = "NEW_ASSET"  # NEW_ASSET or EXISTING_ASSET
    asset_type_requested: Optional[AssetType] = None  # For NEW_ASSET
    description: Optional[str] = None  # "I need a laptop for development"
    asset_id: Optional[int] = None  # For EXISTING_ASSET - specific asset they want


class AssetRequestRead(APIModel):
    id: int
    request_type: str
    asset_type_requested: Optional[str] = None
    description: Optional[str] = None
    asset_id: Optional[int] = None
    requester_id: int
    status: str
    resolved_by_id: Optional[int] = None
    resolution_notes: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    
    # Resolved names for display
    requester_name: Optional[str] = None
    asset_tag: Optional[str] = None  # If requesting specific asset
    resolved_by_name: Optional[str] = None


# Pydantic v2: resolve forward refs / circular refs
AssetDetailRead.model_rebuild()
AssetRead.model_rebuild()
AssetEventRead.model_rebuild()
UserRead.model_rebuild()
LocationRead.model_rebuild()
UserRequestRead.model_rebuild()
UserEventRead.model_rebuild()
AssetRequestRead.model_rebuild()


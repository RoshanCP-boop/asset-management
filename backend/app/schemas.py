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
    must_change_password: bool = False

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
    warranty_end: Optional[date] = None
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
    warranty_end: Optional[date] = None
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
    warranty_end: Optional[date]
    renewal_date: Optional[date]

    seats_total: Optional[int]
    seats_used: Optional[int]

    status: AssetStatus
    condition: AssetCondition

    owner_org: str
    location_id: Optional[int]
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


# Pydantic v2: resolve forward refs / circular refs
AssetDetailRead.model_rebuild()
AssetRead.model_rebuild()
AssetEventRead.model_rebuild()
UserRead.model_rebuild()
LocationRead.model_rebuild()
UserRequestRead.model_rebuild()


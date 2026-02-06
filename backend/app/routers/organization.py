import os
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.db import get_db
from app import schemas, models
from app.auth import require_roles, get_current_user
from app.models import UserRole, User, Organization, Asset, AssetType, AssetStatus, AssetCondition

router = APIRouter(prefix="/organization", tags=["organization"])

# Allowed image file extensions and MIME types
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
ALLOWED_MIME_TYPES = {
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Directory to store uploaded logos
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "logos")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/current", response_model=schemas.OrganizationRead)
def get_current_organization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's organization."""
    if not current_user.organization_id:
        raise HTTPException(404, "User is not part of an organization")
    
    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    
    return org


@router.put("/current", response_model=schemas.OrganizationRead)
def update_organization(
    payload: schemas.OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update organization settings. Admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can update organization settings")
    
    if not current_user.organization_id:
        raise HTTPException(404, "User is not part of an organization")
    
    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Update fields if provided
    if payload.name is not None:
        org.name = payload.name
    if payload.logo_url is not None:
        org.logo_url = payload.logo_url if payload.logo_url else None
    
    # Handle employee ID prefix change
    if payload.employee_id_prefix is not None:
        old_prefix = org.employee_id_prefix
        new_prefix = payload.employee_id_prefix.upper() if payload.employee_id_prefix else None
        org.employee_id_prefix = new_prefix
        
        if new_prefix:
            # Get all users in the organization
            users = db.query(User).filter(User.organization_id == org.id).all()
            
            if old_prefix:
                # Update existing employee IDs with new prefix
                for user in users:
                    if user.employee_id and user.employee_id.startswith(old_prefix):
                        # Extract the number part and apply new prefix
                        number_part = user.employee_id[len(old_prefix):]
                        user.employee_id = f"{new_prefix}{number_part}"
                    elif not user.employee_id:
                        # User doesn't have an ID, assign one
                        pass  # Will be handled below
            
            # Assign IDs to any users without one
            users_without_id = [u for u in users if not u.employee_id]
            if users_without_id:
                # Find the max existing number
                existing_nums = []
                for user in users:
                    if user.employee_id and user.employee_id.startswith(new_prefix):
                        try:
                            num = int(user.employee_id[len(new_prefix):])
                            existing_nums.append(num)
                        except ValueError:
                            pass
                
                max_num = max(existing_nums) if existing_nums else 0
                
                # Assign sequential IDs
                for user in users_without_id:
                    max_num += 1
                    user.employee_id = f"{new_prefix}{str(max_num).zfill(3)}"
        else:
            # Prefix was cleared - clear all employee IDs
            users = db.query(User).filter(User.organization_id == org.id).all()
            for user in users:
                user.employee_id = None
    
    db.commit()
    db.refresh(org)
    return org


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload organization logo. Admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can upload organization logo")
    
    if not current_user.organization_id:
        raise HTTPException(404, "User is not part of an organization")
    
    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Validate file extension
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400, 
            f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, f"Invalid content type: {file.content_type}")
    
    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB")
    
    # Generate unique filename
    unique_id = uuid.uuid4().hex[:12]
    new_filename = f"org_{org.id}_{unique_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, new_filename)
    
    # Delete old logo file if exists
    if org.logo_url and "/organization/logo/" in org.logo_url:
        old_filename = org.logo_url.split("/")[-1]
        old_path = os.path.join(UPLOAD_DIR, old_filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass  # Ignore deletion errors
    
    # Save the new file
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Update organization with new logo URL (relative path without /api prefix)
    org.logo_url = f"/organization/logo/{new_filename}"
    db.commit()
    db.refresh(org)
    
    return {"logo_url": org.logo_url, "message": "Logo uploaded successfully"}


@router.get("/logo/{filename}")
async def get_logo(filename: str):
    """Serve uploaded logo file."""
    # Sanitize filename to prevent path traversal
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(404, "Logo not found")
    
    # Determine media type from extension
    ext = os.path.splitext(safe_filename)[1].lower()
    media_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    }
    media_type = media_types.get(ext, 'application/octet-stream')
    
    return FileResponse(file_path, media_type=media_type)


@router.delete("/logo")
def delete_logo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete organization logo. Admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can delete organization logo")
    
    if not current_user.organization_id:
        raise HTTPException(404, "User is not part of an organization")
    
    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Delete file if exists
    if org.logo_url and "/organization/logo/" in org.logo_url:
        old_filename = org.logo_url.split("/")[-1]
        old_path = os.path.join(UPLOAD_DIR, old_filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    
    org.logo_url = None
    db.commit()
    
    return {"message": "Logo deleted successfully"}


@router.get("/dashboard")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get organization dashboard statistics."""
    if not current_user.organization_id:
        raise HTTPException(404, "User is not part of an organization")
    
    org_id = current_user.organization_id
    org = db.get(Organization, org_id)
    
    # Total users
    total_users = db.query(func.count(User.id)).filter(
        User.organization_id == org_id,
        User.is_active == True
    ).scalar() or 0
    
    # Total assets
    total_assets = db.query(func.count(Asset.id)).filter(
        Asset.organization_id == org_id
    ).scalar() or 0
    
    # Assets by type
    hardware_count = db.query(func.count(Asset.id)).filter(
        Asset.organization_id == org_id,
        Asset.asset_type == AssetType.HARDWARE
    ).scalar() or 0
    
    software_count = db.query(func.count(Asset.id)).filter(
        Asset.organization_id == org_id,
        Asset.asset_type == AssetType.SOFTWARE
    ).scalar() or 0
    
    # Assets by status
    status_counts = {}
    for status in AssetStatus:
        count = db.query(func.count(Asset.id)).filter(
            Asset.organization_id == org_id,
            Asset.status == status
        ).scalar() or 0
        status_counts[status.value] = count
    
    # Assets by condition (hardware only)
    condition_counts = {}
    for condition in AssetCondition:
        count = db.query(func.count(Asset.id)).filter(
            Asset.organization_id == org_id,
            Asset.asset_type == AssetType.HARDWARE,
            Asset.condition == condition
        ).scalar() or 0
        condition_counts[condition.value] = count
    
    # Assets needing data wipe
    needs_data_wipe = db.query(func.count(Asset.id)).filter(
        Asset.organization_id == org_id,
        Asset.needs_data_wipe == True
    ).scalar() or 0
    
    # Upcoming warranty expirations (next 30 days)
    today = date.today()
    thirty_days = today + timedelta(days=30)
    
    warranty_expiring = db.query(Asset).filter(
        Asset.organization_id == org_id,
        Asset.asset_type == AssetType.HARDWARE,
        Asset.warranty_end != None,
        Asset.warranty_end >= today,
        Asset.warranty_end <= thirty_days
    ).all()
    
    # Upcoming software renewals (next 30 days)
    renewals_coming = db.query(Asset).filter(
        Asset.organization_id == org_id,
        Asset.asset_type == AssetType.SOFTWARE,
        Asset.renewal_date != None,
        Asset.renewal_date >= today,
        Asset.renewal_date <= thirty_days
    ).all()
    
    # Hardware assets by category (top 10)
    hardware_category_stats = db.query(
        Asset.category, 
        func.count(Asset.id).label('count')
    ).filter(
        Asset.organization_id == org_id,
        Asset.asset_type == AssetType.HARDWARE,
        Asset.category != None
    ).group_by(Asset.category).order_by(func.count(Asset.id).desc()).limit(10).all()
    
    # Software/subscriptions breakdown (by subscription name)
    software_stats = db.query(
        Asset.subscription, 
        func.count(Asset.id).label('count'),
        func.sum(Asset.seats_total).label('seats_total'),
        func.sum(Asset.seats_used).label('seats_used')
    ).filter(
        Asset.organization_id == org_id,
        Asset.asset_type == AssetType.SOFTWARE,
        Asset.subscription != None
    ).group_by(Asset.subscription).order_by(func.count(Asset.id).desc()).limit(10).all()
    
    return {
        "organization": {
            "id": org.id,
            "name": org.name,
            "logo_url": org.logo_url,
            "employee_id_prefix": org.employee_id_prefix,
        },
        "totals": {
            "users": total_users,
            "assets": total_assets,
            "hardware": hardware_count,
            "software": software_count,
        },
        "status_breakdown": status_counts,
        "condition_breakdown": condition_counts,
        "needs_data_wipe": needs_data_wipe,
        "warranty_expiring_soon": [
            {
                "id": a.id,
                "asset_tag": a.asset_tag,
                "category": a.category,
                "model": a.model,
                "warranty_end": a.warranty_end.isoformat() if a.warranty_end else None,
            }
            for a in warranty_expiring
        ],
        "renewals_coming_soon": [
            {
                "id": a.id,
                "asset_tag": a.asset_tag,
                "subscription": a.subscription,
                "renewal_date": a.renewal_date.isoformat() if a.renewal_date else None,
                "seats_total": a.seats_total,
                "seats_used": a.seats_used,
            }
            for a in renewals_coming
        ],
        "hardware_categories": [
            {"category": cat, "count": count}
            for cat, count in hardware_category_stats
        ],
        "software_subscriptions": [
            {
                "name": name,
                "count": count,
                "seats_total": int(seats_total) if seats_total else 0,
                "seats_used": int(seats_used) if seats_used else 0,
            }
            for name, count, seats_total, seats_used in software_stats
        ],
    }


@router.post("/generate-employee-id/{user_id}")
def generate_employee_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an employee ID for a user. Admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can generate employee IDs")
    
    if not current_user.organization_id:
        raise HTTPException(404, "User is not part of an organization")
    
    org = db.get(Organization, current_user.organization_id)
    if not org or not org.employee_id_prefix:
        raise HTTPException(400, "Organization has no employee ID prefix set")
    
    user = db.get(User, user_id)
    if not user or user.organization_id != current_user.organization_id:
        raise HTTPException(404, "User not found")
    
    if user.employee_id:
        raise HTTPException(400, "User already has an employee ID")
    
    # Find the next available number
    prefix = org.employee_id_prefix
    existing_ids = db.query(User.employee_id).filter(
        User.organization_id == org.id,
        User.employee_id != None,
        User.employee_id.like(f"{prefix}%")
    ).all()
    
    # Extract numbers and find max
    max_num = 0
    for (emp_id,) in existing_ids:
        if emp_id and emp_id.startswith(prefix):
            try:
                num = int(emp_id[len(prefix):])
                max_num = max(max_num, num)
            except ValueError:
                pass
    
    # Generate new ID
    new_id = f"{prefix}{str(max_num + 1).zfill(3)}"
    user.employee_id = new_id
    db.commit()
    
    return {"employee_id": new_id, "user_id": user_id}


@router.put("/users/{user_id}/employee-id")
def set_employee_id(
    user_id: int,
    employee_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually set an employee ID for a user. Admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only admins can set employee IDs")
    
    user = db.get(User, user_id)
    if not user or user.organization_id != current_user.organization_id:
        raise HTTPException(404, "User not found")
    
    # Check for duplicates
    existing = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.employee_id == employee_id,
        User.id != user_id
    ).first()
    if existing:
        raise HTTPException(400, f"Employee ID {employee_id} is already in use")
    
    user.employee_id = employee_id
    db.commit()
    
    return {"employee_id": employee_id, "user_id": user_id}

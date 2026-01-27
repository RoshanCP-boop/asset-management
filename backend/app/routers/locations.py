from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app import schemas, crud
from app.auth import require_roles, get_current_user
from app.models import UserRole, User

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=schemas.LocationRead, dependencies=[Depends(require_roles(UserRole.ADMIN))])
def create_location(payload: schemas.LocationCreate, db: Session = Depends(get_db)):
    return crud.create_location(db, payload)


@router.get("", response_model=list[schemas.LocationRead])
def list_locations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return crud.list_locations(db)

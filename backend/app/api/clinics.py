import uuid
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from app.schemas.entities import Clinic, ClinicCreate
from app.auth import require_role, CurrentUser
from app import db

router = APIRouter(prefix="/api/clinics", tags=["clinics"])


@router.get("", response_model=List[Clinic])
def get_clinics(locality: Optional[str] = Query(None, description="Filter by Pune locality")):
    return db.list_clinics(locality=locality)


@router.get("/{clinic_id}", response_model=Clinic)
def get_clinic(clinic_id: str):
    clinic = db.get_clinic(clinic_id)
    if not clinic:
        raise HTTPException(404, "Clinic not found")
    return clinic


@router.post("", response_model=Clinic)
def create_clinic(payload: ClinicCreate, user: CurrentUser = Depends(require_role("admin"))):
    cid = payload.id or f"CLN-{uuid.uuid4().hex[:6].upper()}"
    clinic = Clinic(id=cid, **payload.model_dump(exclude={"id"}))
    return db.save_clinic(clinic)


@router.delete("/{clinic_id}")
def delete_clinic(clinic_id: str, user: CurrentUser = Depends(require_role("admin"))):
    success = db.delete_clinic(clinic_id)
    if not success:
        raise HTTPException(404, "Clinic not found")
    return {"status": "deleted", "id": clinic_id}

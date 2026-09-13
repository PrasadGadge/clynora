import uuid
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from app.schemas.entities import Doctor, DoctorCreate
from app.auth import require_role, CurrentUser
from app import db

router = APIRouter(prefix="/api/doctors", tags=["doctors"])


@router.get("", response_model=List[dict])
def get_doctors(
    clinic_id: Optional[str] = Query(None, description="Filter by clinic"),
    specialization: Optional[str] = Query(None, description="Filter by specialization"),
):
    return db.list_doctors(clinic_id=clinic_id, specialization=specialization)


@router.get("/{doctor_id}", response_model=dict)
def get_doctor(doctor_id: str):
    doc = db.get_doctor(doctor_id)
    if not doc:
        raise HTTPException(404, "Doctor not found")
    return doc


@router.post("", response_model=dict)
def create_doctor(payload: DoctorCreate, user: CurrentUser = Depends(require_role("admin"))):
    did = payload.id or f"DOC-{uuid.uuid4().hex[:6].upper()}"
    doc = Doctor(id=did, **payload.model_dump(exclude={"id"}))
    return db.save_doctor(doc)


@router.delete("/{doctor_id}")
def delete_doctor(doctor_id: str, user: CurrentUser = Depends(require_role("admin"))):
    success = db.delete_doctor(doctor_id)
    if not success:
        raise HTTPException(404, "Doctor not found")
    return {"status": "deleted", "id": doctor_id}

import uuid
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.schemas.entities import Patient, PatientCreate
from app.auth import get_current_user, require_role, CurrentUser
from app import db

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("", response_model=List[Patient])
def get_patients(user: CurrentUser = Depends(get_current_user)):
    return db.list_patients()


@router.get("/{patient_id}", response_model=Patient)
def get_patient(patient_id: str, user: CurrentUser = Depends(get_current_user)):
    pat = db.get_patient(patient_id)
    if not pat:
        raise HTTPException(404, "Patient not found")
    return pat


@router.post("", response_model=Patient)
def create_patient(payload: PatientCreate, user: CurrentUser = Depends(require_role("admin", "coordinator"))):
    pid = payload.id or f"PAT-{uuid.uuid4().hex[:6].upper()}"
    pat = Patient(id=pid, **payload.model_dump(exclude={"id"}))
    return db.save_patient(pat)

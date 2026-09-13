import uuid
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from app.schemas.entities import Appointment, AppointmentCreate
from app.auth import get_current_user, CurrentUser
from app import db

router = APIRouter(prefix="/api/appointments", tags=["appointments"])


@router.get("", response_model=List[dict])
def get_appointments(
    clinic_id: Optional[str] = Query(None, description="Filter by clinic"),
    doctor_id: Optional[str] = Query(None, description="Filter by doctor"),
    user: CurrentUser = Depends(get_current_user),
):
    return db.list_appointments(clinic_id=clinic_id, doctor_id=doctor_id)


@router.get("/{appointment_id}", response_model=dict)
def get_appointment(appointment_id: str, user: CurrentUser = Depends(get_current_user)):
    apt = db.get_appointment(appointment_id)
    if not apt:
        raise HTTPException(404, "Appointment not found")
    return apt


@router.post("", response_model=dict)
def create_appointment(payload: AppointmentCreate, user: CurrentUser = Depends(get_current_user)):
    aid = payload.id or f"APT-{uuid.uuid4().hex[:6].upper()}"
    apt = Appointment(id=aid, **payload.model_dump(exclude={"id"}))
    return db.save_appointment(apt)


@router.patch("/{appointment_id}/status", response_model=dict)
def update_status(appointment_id: str, status: str, user: CurrentUser = Depends(get_current_user)):
    if status not in ("scheduled", "completed", "cancelled", "no-show"):
        raise HTTPException(400, "Invalid status")
    apt = db.update_appointment_status(appointment_id, status)
    if not apt:
        raise HTTPException(404, "Appointment not found")
    return apt

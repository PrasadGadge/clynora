from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ClinicBase(BaseModel):
    name: str
    address: str
    locality: str
    city: str = "Pune"
    state: str = "Maharashtra"
    pincode: str
    phone: str
    email: str
    specialities: List[str] = Field(default_factory=list)

class ClinicCreate(ClinicBase):
    id: Optional[str] = None

class Clinic(ClinicBase):
    id: str
    created_at: Optional[str] = None

class DoctorBase(BaseModel):
    clinic_id: str
    name: str
    specialization: str
    qualification: str
    phone: str
    email: str
    availability: str = "Mon-Sat 09:00 - 17:00"

class DoctorCreate(DoctorBase):
    id: Optional[str] = None

class Doctor(DoctorBase):
    id: str
    created_at: Optional[str] = None

class PatientBase(BaseModel):
    name: str
    age: int
    sex: str
    phone: str
    email: Optional[str] = None
    address: str
    medical_history: Optional[str] = None
    allergies: Optional[str] = None

class PatientCreate(PatientBase):
    id: Optional[str] = None

class Patient(PatientBase):
    id: str
    created_at: Optional[str] = None

class AppointmentBase(BaseModel):
    clinic_id: str
    doctor_id: str
    patient_name: str
    patient_phone: str
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None
    appointment_date: str
    appointment_time: str
    reason: str
    status: str = "scheduled"

class AppointmentCreate(AppointmentBase):
    id: Optional[str] = None

class Appointment(AppointmentBase):
    id: str
    created_at: Optional[str] = None

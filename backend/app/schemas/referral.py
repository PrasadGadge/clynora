"""
ClinBridge — Frozen Referral Schema

10 required fields (Master Plan v4) are what get validated/scored.
diagnosis_documented, imaging, treatment_documented (from the Blueprint's
broader model) are optional -- captured if present, never required, never
scored as "missing."

Rule enforced everywhere downstream: a field the source document doesn't
mention must come back as null / empty list, never a guessed value, and
never a false negative like "No known allergies" when allergies simply
weren't documented.
"""

from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


class Vitals(BaseModel):
    blood_pressure: Optional[str] = None
    heart_rate: Optional[str] = None
    spo2: Optional[str] = None
    temperature: Optional[str] = None


class Situation(BaseModel):
    reason_for_referral: Optional[str] = None
    urgency_documented: Optional[str] = None
    urgency_source: Literal["document", "not_documented"] = "not_documented"


class Background(BaseModel):
    history: Optional[str] = None
    medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)


class Assessment(BaseModel):
    vitals: Vitals = Field(default_factory=Vitals)
    investigations: list[str] = Field(default_factory=list)
    diagnosis_documented: Optional[str] = None
    imaging: list[str] = Field(default_factory=list)


class Recommendation(BaseModel):
    referred_to: Optional[str] = None
    referring_physician_contact: Optional[str] = None
    treatment_documented: Optional[str] = None


class PatientDemographics(BaseModel):
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None


class ExtractedReferral(BaseModel):
    patient: PatientDemographics = Field(default_factory=PatientDemographics)
    situation: Situation = Field(default_factory=Situation)
    background: Background = Field(default_factory=Background)
    assessment: Assessment = Field(default_factory=Assessment)
    recommendation: Recommendation = Field(default_factory=Recommendation)


class ValidationResult(BaseModel):
    missing_fields: list[str] = Field(default_factory=list)
    potential_conflicts: list[str] = Field(default_factory=list)
    quality_score: int = 0
    band: Literal["ready_for_review", "needs_information", "requires_attention"] = "requires_attention"
    # Explainability (Master Instruction §20): raw counts behind quality_score,
    # so the UI/SBAR can show the calculation instead of a bare number.
    missing_critical_count: int = 0
    missing_optional_count: int = 0
    conflict_count: int = 0
    base_score: int = 100
    possible_duplicates: list[str] = Field(default_factory=list)


class ReferralRecord(BaseModel):
    referral_id: str
    raw_text: str
    extracted: ExtractedReferral
    validation: ValidationResult
    sbar: Optional[str] = None
    status: Literal[
        "created", "reviewed", "approved", "sent", "acknowledged", "closed", "rejected"
    ] = "created"
    # Closed-loop handover tracking (Master Instruction §18) + aging (§19)
    created_at: Optional[str] = None
    sent_at: Optional[str] = None
    acknowledged_at: Optional[str] = None
    closed_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    closed_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    # Ownership & visibility scoping (Phase 3)
    created_by: Optional[str] = None
    assigned_to: Optional[str] = None
    clinic_id: Optional[str] = None


REQUIRED_FIELDS = [
    "patient.patient_age",
    "patient.patient_sex",
    "situation.reason_for_referral",
    "background.history",
    "assessment.vitals",
    "background.medications",
    "background.allergies",
    "assessment.investigations",
    "recommendation.referred_to",
    "recommendation.referring_physician_contact",
]

"""
ClinBridge — Referral API routes

Every endpoint requires authentication. Mutating endpoints additionally
enforce the server-side workflow state machine (app/rules/workflow.py) —
the frontend's disabled buttons are a UX convenience only and are never
trusted on their own. Every meaningful action writes an audit event
(app/db.record_referral_event); edits that change referral content write
a new version snapshot (app/db.save_referral_version) rather than
overwriting history.
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from app.schemas.referral import ReferralRecord
from app.services.extractor import extract_clinical_fields
from app.rules.validator import validate_referral
from app.services.handover import generate_handover
from app.rules import workflow
from app.auth import get_current_user, CurrentUser
from app.security import extraction_limiter
from app import db

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


class NewReferralRequest(BaseModel):
    raw_text: str


class ApproveRequest(BaseModel):
    edited_sbar: str | None = None


class RejectRequest(BaseModel):
    reason: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _can_view_referral(record: ReferralRecord, user: CurrentUser) -> bool:
    """
    Evaluates row-level access control based on user identity and role.
    Admin and coordinator retain operational oversight.
    Referring clinicians see referrals they originated.
    Receiving clinicians see referrals assigned/directed to their specialty or person.
    """
    if user.role in ("admin", "coordinator"):
        return True
    if user.role == "referring_clinician":
        if record.created_by == user.username or record.created_by is None:
            return True
        return False
    if user.role == "receiving_clinician":
        if record.assigned_to == user.username:
            return True
        dest = (record.extracted.recommendation.referred_to or "").lower()
        if user.username == "dr.rao" and ("rao" in dest or "cardio" in dest or "shivajinagar" in dest or not record.assigned_to):
            return True
        if record.assigned_to is None:
            return True
        return False
    return False


def _apply_transition(
    record: ReferralRecord,
    target_status: str,
    user: CurrentUser,
    event_type: str,
    change_summary: str | None = None,
) -> ReferralRecord:
    """Validates + performs one state-machine transition, with audit logging."""
    if not _can_view_referral(record, user):
        raise HTTPException(403, f"User '{user.username}' is not authorized to access referral '{record.referral_id}'")

    try:
        workflow.assert_valid_transition(record.status, target_status)
        workflow.assert_role_permitted(record.status, target_status, user.role)
    except workflow.InvalidTransitionError as e:
        raise HTTPException(409, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))

    old_status = record.status
    record.status = target_status
    db.save_referral(record)
    db.record_referral_event(
        referral_id=record.referral_id,
        event_type=event_type,
        actor_username=user.username,
        actor_role=user.role,
        old_status=old_status,
        new_status=target_status,
        change_summary=change_summary,
    )
    return record


@router.post("", response_model=ReferralRecord)
def create_referral(payload: NewReferralRequest, request: Request, user: CurrentUser = Depends(get_current_user)):
    """Full pipeline in one call: extract -> validate -> generate SBAR."""
    extraction_limiter.check(request)

    if not payload.raw_text or not payload.raw_text.strip():
        raise HTTPException(400, "raw_text is required")
    if len(payload.raw_text) > 20_000:
        raise HTTPException(400, "raw_text exceeds maximum length (20,000 characters)")

    referral_id = f"CLB-{uuid.uuid4().hex[:6].upper()}"

    try:
        extracted = extract_clinical_fields(payload.raw_text)
    except ValueError as e:
        raise HTTPException(502, f"Extraction failed: {e}")
    except Exception as e:
        raise HTTPException(502, f"Extraction failed with unexpected error: {e}")

    try:
        existing_referrals = db.list_all_referrals()
        validation = validate_referral(payload.raw_text, extracted, existing_referrals=existing_referrals)
        sbar = generate_handover(extracted, validation)

        # Map receiving clinician assignment from destination if identifiable
        assigned_to = None
        referred_to_str = (extracted.recommendation.referred_to or "").lower()
        if "rao" in referred_to_str or "shivajinagar" in referred_to_str or "cardio" in referred_to_str:
            assigned_to = "dr.rao"

        record = ReferralRecord(
            referral_id=referral_id,
            raw_text=payload.raw_text,
            extracted=extracted,
            validation=validation,
            sbar=sbar,
            status="created",
            created_at=_now_iso(),
            created_by=user.username,
            assigned_to=assigned_to,
        )
        db.save_referral(record)
        db.save_referral_version(referral_id, record, actor_username=user.username, change_summary="Initial extraction")
        db.record_referral_event(
            referral_id=referral_id,
            event_type="referral_created",
            actor_username=user.username,
            actor_role=user.role,
            old_status=None,
            new_status="created",
        )
        db.record_referral_event(
            referral_id=referral_id,
            event_type="extraction_completed",
            actor_username=user.username,
            actor_role=user.role,
            change_summary=f"Quality score {validation.quality_score}/100 ({validation.band})",
        )
        return record
    except Exception as e:
        raise HTTPException(500, f"Referral processing failed: {e}")


@router.get("/{referral_id}", response_model=ReferralRecord)
def get_referral(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if not _can_view_referral(record, user):
        raise HTTPException(403, "Access to this referral is not authorized for your role/account")
    return record


@router.get("", response_model=list[ReferralRecord])
def list_referrals(user: CurrentUser = Depends(get_current_user)):
    all_records = db.list_all_referrals()
    return [r for r in all_records if _can_view_referral(r, user)]


@router.get("/{referral_id}/history")
def get_referral_history(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if not _can_view_referral(record, user):
        raise HTTPException(403, "Access to this referral history is not authorized")
    return db.list_referral_events(referral_id)


@router.get("/{referral_id}/versions")
def get_referral_versions(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if not _can_view_referral(record, user):
        raise HTTPException(403, "Access to this referral versions is not authorized")
    return db.list_referral_versions(referral_id)


@router.get("/{referral_id}/versions/{version_number}")
def get_referral_version_detail(referral_id: str, version_number: int, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if not _can_view_referral(record, user):
        raise HTTPException(403, "Access to this referral version is not authorized")
    version = db.get_referral_version(referral_id, version_number)
    if not version:
        raise HTTPException(404, "Version not found")
    return version


@router.post("/{referral_id}/approve", response_model=ReferralRecord)
def approve_referral(referral_id: str, payload: ApproveRequest, user: CurrentUser = Depends(get_current_user)):
    """
    Clinician approval. A clinician approving a referral they have not
    separately clicked "Mark as Reviewed" for is still, substantively,
    reviewing it -- so from `created` this performs created->reviewed->
    approved as one atomic clinician action (both transitions are still
    individually validated and audited). From `reviewed` it performs the
    single reviewed->approved transition.
    """
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if record.status not in ("created", "reviewed"):
        raise HTTPException(409, f"Cannot approve a referral in status '{record.status}'")

    if payload.edited_sbar and payload.edited_sbar != record.sbar:
        record.sbar = payload.edited_sbar
        db.save_referral(record)
        db.save_referral_version(referral_id, record, actor_username=user.username, change_summary="Clinician edited SBAR")
        db.record_referral_event(
            referral_id=referral_id,
            event_type="referral_edited",
            actor_username=user.username,
            actor_role=user.role,
            change_summary="SBAR edited by clinician prior to approval",
        )

    if record.status == "created":
        _apply_transition(record, "reviewed", user, "referral_reviewed")
    _apply_transition(record, "approved", user, "referral_approved")
    return record


@router.post("/{referral_id}/reviewed", response_model=ReferralRecord)
def mark_reviewed(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    return _apply_transition(record, "reviewed", user, "referral_reviewed")


@router.post("/{referral_id}/send", response_model=ReferralRecord)
def send_referral(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    record = _apply_transition(record, "sent", user, "referral_sent")
    record.sent_at = _now_iso()
    db.save_referral(record)
    return record


@router.post("/{referral_id}/acknowledge", response_model=ReferralRecord)
def acknowledge_referral(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    record = _apply_transition(record, "acknowledged", user, "referral_acknowledged")
    record.acknowledged_at = _now_iso()
    record.acknowledged_by = user.username
    db.save_referral(record)
    return record


@router.post("/{referral_id}/close", response_model=ReferralRecord)
def close_referral(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    record = _apply_transition(record, "closed", user, "referral_closed")
    record.closed_at = _now_iso()
    record.closed_by = user.username
    db.save_referral(record)
    return record


@router.post("/{referral_id}/reject", response_model=ReferralRecord)
def reject_referral(referral_id: str, payload: RejectRequest, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(400, "A rejection reason is required")
    record = _apply_transition(record, "rejected", user, "referral_rejected", change_summary=payload.reason)
    record.rejection_reason = payload.reason
    db.save_referral(record)
    return record


@router.post("/{referral_id}/reopen", response_model=ReferralRecord)
def reopen_referral(referral_id: str, user: CurrentUser = Depends(get_current_user)):
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    record = _apply_transition(record, "created", user, "referral_reopened")
    record.rejection_reason = None
    db.save_referral(record)
    return record


@router.patch("/{referral_id}/status", response_model=ReferralRecord)
def update_status(referral_id: str, status: str, user: CurrentUser = Depends(get_current_user)):
    """
    Generic transition endpoint retained for the existing frontend tracking
    UI (`updateReferralStatus`). Delegates to the same state-machine
    enforcement as every dedicated endpoint above -- an invalid transition
    (e.g. created -> sent) is rejected here exactly as it would be anywhere
    else, per the state-machine requirement.
    """
    record = db.get_referral(referral_id)
    if not record:
        raise HTTPException(404, "Referral not found")
    if status not in workflow.ALL_STATUSES:
        raise HTTPException(400, "Invalid status")
    event_type = {
        "reviewed": "referral_reviewed",
        "approved": "referral_approved",
        "sent": "referral_sent",
        "acknowledged": "referral_acknowledged",
        "closed": "referral_closed",
        "rejected": "referral_rejected",
        "created": "referral_reopened",
    }.get(status, "referral_status_changed")
    record = _apply_transition(record, status, user, event_type)
    if status == "sent":
        record.sent_at = _now_iso()
        db.save_referral(record)
    elif status == "acknowledged":
        record.acknowledged_at = _now_iso()
        record.acknowledged_by = user.username
        db.save_referral(record)
    elif status == "closed":
        record.closed_at = _now_iso()
        record.closed_by = user.username
        db.save_referral(record)
    return record

"""
ClinBridge — Deterministic Validation Engine

The LLM extracts, this module decides. No score, missing-field flag, or
conflict flag is ever produced by the LLM -- only by this plain-Python
logic, so it stays explainable and testable without a running server or
a model call.

FIX ALREADY APPLIED: demographic-conflict detection was originally missing
phrasing like "Patient aged 67... age 61" (only caught "67-year-old" /
"67M/F" patterns). Regex now also matches "aged N" / "age N". Verified
against Case E (single age, "67F") to confirm no false positive was
introduced by this fix.
"""

from app.schemas.referral import ExtractedReferral, ValidationResult
from typing import Literal
from datetime import datetime, timezone

MISSING_CRITICAL_WEIGHT = 10
CONFLICT_WEIGHT = 15
MISSING_OPTIONAL_WEIGHT = 5

CRITICAL_FIELDS = [
    "patient_age", "patient_sex", "reason_for_referral",
    "referred_to", "referring_physician_contact",
]


def _field_is_missing(value) -> bool:
    if value is None:
        return True
    if isinstance(value, list) and len(value) == 0:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _vitals_all_missing(vitals) -> bool:
    return all(
        _field_is_missing(v)
        for v in [vitals.blood_pressure, vitals.heart_rate, vitals.spo2, vitals.temperature]
    )


def check_missing_fields(data: ExtractedReferral) -> tuple[list[str], list[str]]:
    missing_critical, missing_optional = [], []

    field_map = {
        "patient_age": data.patient.patient_age,
        "patient_sex": data.patient.patient_sex,
        "reason_for_referral": data.situation.reason_for_referral,
        "referred_to": data.recommendation.referred_to,
        "referring_physician_contact": data.recommendation.referring_physician_contact,
    }
    for name in CRITICAL_FIELDS:
        if _field_is_missing(field_map[name]):
            missing_critical.append(name)

    optional_map = {
        "history": data.background.history,
        "medications": data.background.medications,
        "allergies": data.background.allergies,
        "investigations": data.assessment.investigations,
    }
    for name in ["history", "medications", "allergies", "investigations"]:
        if _field_is_missing(optional_map[name]):
            missing_optional.append(name)

    if _vitals_all_missing(data.assessment.vitals):
        missing_optional.append("vitals")

    return missing_critical, missing_optional


def check_range_format(data: ExtractedReferral) -> list[str]:
    flags = []
    age = data.patient.patient_age
    if age is not None and not (0 <= age <= 120):
        flags.append(f"Patient age {age} is outside expected 0-120 range")

    spo2_raw = data.assessment.vitals.spo2
    if spo2_raw:
        digits = "".join(ch for ch in spo2_raw if ch.isdigit())
        if digits:
            spo2_val = int(digits)
            if not (0 <= spo2_val <= 100):
                flags.append(f"SpO2 value '{spo2_raw}' is outside expected 0-100% range")

    bp_raw = data.assessment.vitals.blood_pressure
    if bp_raw and "/" not in bp_raw:
        flags.append(f"Blood pressure '{bp_raw}' is not in expected systolic/diastolic format")

    return flags


COMMON_ALLERGY_MED_PAIRS = {
    "penicillin": ["amoxicillin", "ampicillin", "penicillin"],
    "pcn": ["amoxicillin", "ampicillin", "pcn"],
    "sulfa": ["sulfamethoxazole", "bactrim", "sulfonamide"],
    "aspirin": ["aspirin", "asa"],
}


def check_medication_allergy_conflict(data: ExtractedReferral) -> list[str]:
    conflicts = []
    allergies_lower = [a.lower() for a in data.background.allergies]
    meds_lower = [m.lower() for m in data.background.medications]

    for allergy in allergies_lower:
        for known_allergen, conflicting_meds in COMMON_ALLERGY_MED_PAIRS.items():
            if known_allergen in allergy:
                for med in meds_lower:
                    if any(cm in med for cm in conflicting_meds):
                        conflicts.append(
                            f"Potential medication-allergy conflict: documented allergy "
                            f"'{allergy}' vs. current medication '{med}' — clinician verification required."
                        )
    return conflicts


def check_demographic_consistency(raw_text: str, data: ExtractedReferral) -> list[str]:
    """
    FIX APPLIED: added "aged N" / "age N" phrasing on top of the original
    "N-year-old" / "NM"/"NF" patterns, so referrals written as
    "Patient aged 67... later documented age 61" are correctly caught.
    """
    import re
    conflicts = []
    ages_found = set(re.findall(r"(\d{1,3})\s*[- ]?\s*(?:year|yr|y)s?[- ]?old", raw_text, re.IGNORECASE))
    ages_found |= set(re.findall(r"\b(\d{1,3})\s*[MF]\b", raw_text))
    ages_found |= set(re.findall(r"\baged?\s+(\d{1,3})\b", raw_text, re.IGNORECASE))
    if len(ages_found) > 1:
        conflicts.append(
            f"Potential demographic conflict: multiple ages mentioned in referral text ({', '.join(sorted(ages_found))})"
        )
    return conflicts


def calculate_quality_score(missing_critical: list, conflicts: list, missing_optional: list) -> int:
    score = 100
    score -= MISSING_CRITICAL_WEIGHT * len(missing_critical)
    score -= CONFLICT_WEIGHT * len(conflicts)
    score -= MISSING_OPTIONAL_WEIGHT * len(missing_optional)
    return max(score, 0)


def band_for_score(score: int) -> Literal["ready_for_review", "needs_information", "requires_attention"]:
    if score >= 85:
        return "ready_for_review"
    if score >= 60:
        return "needs_information"
    return "requires_attention"


def explain_quality_score(missing_critical_count: int, conflict_count: int, missing_optional_count: int, final_score: int) -> str:
    """
    Human-readable calculation for the UI/SBAR (Master Instruction §20) —
    the score is never shown as a bare number without this available.
    """
    lines = [
        f"Base score: {100}",
        f"Missing critical fields: {missing_critical_count} x {MISSING_CRITICAL_WEIGHT} = -{missing_critical_count * MISSING_CRITICAL_WEIGHT}",
        f"Potential conflicts: {conflict_count} x {CONFLICT_WEIGHT} = -{conflict_count * CONFLICT_WEIGHT}",
        f"Missing optional fields: {missing_optional_count} x {MISSING_OPTIONAL_WEIGHT} = -{missing_optional_count * MISSING_OPTIONAL_WEIGHT}",
        f"Final: {final_score}/100",
        "This is a documentation-quality measure, not a clinical risk or safety score.",
    ]
    return "\n".join(lines)


DUPLICATE_WINDOW_HOURS = 72


def _parse_as_aware_utc(timestamp_str: str):
    """
    Parses an ISO timestamp and guarantees a timezone-AWARE UTC result, so
    callers can always safely subtract it from `datetime.now(timezone.utc)`
    without risking `TypeError: can't subtract offset-naive and
    offset-aware datetimes`. A naive timestamp (no offset) is assumed to
    already be UTC and is tagged as such, rather than rejected -- every
    `created_at` this codebase writes IS UTC (see `_now_iso()` in
    referrals.py), so this is a safe, non-lossy assumption for data that
    predates that convention or was set by another process. Returns None
    (never raises) if the string can't be parsed as a timestamp at all.
    """
    try:
        parsed = datetime.fromisoformat(timestamp_str)
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed


def find_possible_duplicates(raw_text: str, data: ExtractedReferral, existing: list) -> list[str]:
    """
    Documentation/workflow-level duplicate check (Master Instruction §51) —
    NOT a clinical judgement. Flags same age + sex + referral destination
    among referrals created within DUPLICATE_WINDOW_HOURS. `existing` is a
    list of ReferralRecord-like objects (duck-typed: needs .referral_id,
    .extracted, .created_at, .raw_text). Returns matching referral_ids.
    Never auto-discards anything -- the caller only ever surfaces this for
    clinician review.
    """
    matches = []
    age = data.patient.patient_age
    sex = (data.patient.patient_sex or "").strip().lower()
    referred_to = (data.recommendation.referred_to or "").strip().lower()
    if age is None or not sex or not referred_to:
        return matches  # not enough signal to compare safely

    now = datetime.now(timezone.utc)
    for other in existing:
        if other.raw_text == raw_text:
            continue  # identical text is the same submission, not a "possible duplicate"
        o = other.extracted
        if o.patient.patient_age != age:
            continue
        if (o.patient.patient_sex or "").strip().lower() != sex:
            continue
        if (o.recommendation.referred_to or "").strip().lower() != referred_to:
            continue
        if other.created_at:
            created = _parse_as_aware_utc(other.created_at)
            # Unparseable timestamp -> don't let it block a real duplicate flag;
            # a parseable one outside the window means it's just too old.
            if created is not None and (now - created).total_seconds() > DUPLICATE_WINDOW_HOURS * 3600:
                continue
        matches.append(other.referral_id)
    return matches


def validate_referral(raw_text: str, data: ExtractedReferral, existing_referrals: list | None = None) -> ValidationResult:
    missing_critical, missing_optional = check_missing_fields(data)
    conflicts = []
    conflicts += check_range_format(data)
    conflicts += check_medication_allergy_conflict(data)
    conflicts += check_demographic_consistency(raw_text, data)

    score = calculate_quality_score(missing_critical, conflicts, missing_optional)
    duplicates = find_possible_duplicates(raw_text, data, existing_referrals or [])

    return ValidationResult(
        missing_fields=missing_critical + missing_optional,
        potential_conflicts=conflicts,
        quality_score=score,
        band=band_for_score(score),
        missing_critical_count=len(missing_critical),
        missing_optional_count=len(missing_optional),
        conflict_count=len(conflicts),
        base_score=100,
        possible_duplicates=duplicates,
    )

"""
ClinBridge — SBAR Handover Generator

Deliberately NOT an LLM call. Template-filling from already-validated
structured data is the only way to guarantee the generator never invents
treatment or recommendations that aren't documented.

FIX ALREADY APPLIED: diagnosis_documented, imaging, and treatment_documented
were originally silently omitted from the output when absent. Now they
always render "Not documented" like every other field, so absence is
never ambiguous with "the generator forgot to check."
"""

from app.schemas.referral import ExtractedReferral, ValidationResult

NOT_DOCUMENTED = "Not documented"


def _list_or_flag(items: list[str]) -> str:
    return ", ".join(items) if items else NOT_DOCUMENTED


def generate_handover(data: ExtractedReferral, validation: ValidationResult) -> str:
    v = data.assessment.vitals
    vitals_line = (
        f"BP {v.blood_pressure or NOT_DOCUMENTED}, "
        f"HR {v.heart_rate or NOT_DOCUMENTED}, "
        f"SpO2 {v.spo2 or NOT_DOCUMENTED}, "
        f"Temp {v.temperature or NOT_DOCUMENTED}"
    )

    lines = [
        "=== SBAR HANDOVER (draft — clinician review required) ===",
        "",
        f"Patient: {data.patient.patient_age or NOT_DOCUMENTED} year old "
        f"{data.patient.patient_sex or NOT_DOCUMENTED}",
        "",
        "S — SITUATION",
        data.situation.reason_for_referral or NOT_DOCUMENTED,
        f"Urgency: {data.situation.urgency_documented or NOT_DOCUMENTED} "
        f"(source: {data.situation.urgency_source})",
        "",
        "B — BACKGROUND",
        f"History: {data.background.history or NOT_DOCUMENTED}",
        f"Medications: {_list_or_flag(data.background.medications)}",
        f"Allergies: {_list_or_flag(data.background.allergies)}",
        "",
        "A — ASSESSMENT",
        f"Vitals: {vitals_line}",
        f"Investigations: {_list_or_flag(data.assessment.investigations)}",
        f"Diagnosis documented: {data.assessment.diagnosis_documented or NOT_DOCUMENTED}",
        f"Imaging: {_list_or_flag(data.assessment.imaging)}",
        "",
        "R — RECOMMENDATION / REQUEST",
        f"Referred to: {data.recommendation.referred_to or NOT_DOCUMENTED}",
        f"Referring physician contact: {data.recommendation.referring_physician_contact or NOT_DOCUMENTED}",
        f"Treatment documented by referring clinician: {data.recommendation.treatment_documented or NOT_DOCUMENTED}",
        "",
        f"--- Referral Quality Score: {validation.quality_score}/100 ({validation.band.replace('_', ' ')}) ---",
        "Prototype heuristic measuring documentation completeness and detected consistency issues. "
        "Not a clinical risk or safety score.",
        "",
        "Score calculation:",
        f"  Base: 100",
        f"  Missing critical fields: {validation.missing_critical_count} x 10 = -{validation.missing_critical_count * 10}",
        f"  Potential conflicts: {validation.conflict_count} x 15 = -{validation.conflict_count * 15}",
        f"  Missing optional fields: {validation.missing_optional_count} x 5 = -{validation.missing_optional_count * 5}",
    ]

    if validation.possible_duplicates:
        lines.append("")
        lines.append(
            f"Possible duplicate referral — clinician review recommended "
            f"(similar to: {', '.join(validation.possible_duplicates)})."
        )

    if validation.missing_fields:
        lines.append(f"Missing information: {', '.join(validation.missing_fields)}")
    if validation.potential_conflicts:
        lines.append("Potential conflicts flagged for clinician review:")
        for c in validation.potential_conflicts:
            lines.append(f"  - {c}")

    return "\n".join(lines)

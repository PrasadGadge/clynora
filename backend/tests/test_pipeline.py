"""
Runs Master Plan v4 §20's core demo cases through the real pipeline, plus
unit tests on the validator that don't require an OPENROUTER_API_KEY.

Run just the offline validator tests with:
    pytest tests/test_pipeline.py -k "not extraction" -v

Run the full pipeline (needs OPENROUTER_API_KEY set and
RUN_OPENROUTER_INTEGRATION_TESTS=1) with:
    $env:RUN_OPENROUTER_INTEGRATION_TESTS = "1"
    pytest tests/test_pipeline.py -v
"""

import os
import pytest
from dotenv import load_dotenv

# FIX APPLIED: the integration-test gate must read the same .env-first
# environment the app itself uses, or the gate and the app can disagree
# about whether a key is configured.
load_dotenv(override=True)

from app.schemas.referral import ExtractedReferral, Situation, Background, Assessment, Vitals, Recommendation, PatientDemographics
from app.rules.validator import validate_referral

CASE_B_MISSING = """67-year-old female referred for chest pain.
History of hypertension.
Refer to cardiology."""

CASE_D_CONFLICT = """67-year-old female.
Penicillin allergy documented.
Medication: amoxicillin."""

CASE_C_DEMOGRAPHIC = """67-year-old female presenting with fatigue.
...
Later noted: 61-year-old female, referred to endocrinology."""

CASE_C_ALT_PHRASING = """Patient aged 67 presenting with fatigue.
...
Later documented age 61, referred to endocrinology."""

CASE_E_MESSY = """67F c/o CP.
Hx HTN + DM.
BP 160/100, SpO2 91%.
On ASA + metformin.
Allergy: PCN.
Refer cardio."""

requires_api_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY")
    or os.environ.get("OPENROUTER_API_KEY", "").strip() == "your_key_here"
    or os.environ.get("RUN_OPENROUTER_INTEGRATION_TESTS") != "1",
    reason="OPENROUTER integration tests disabled or OPENROUTER_API_KEY not set",
)


def test_missing_field_detection_case_b():
    data = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        situation=Situation(reason_for_referral="chest pain"),
        background=Background(history="hypertension"),
        assessment=Assessment(),
        recommendation=Recommendation(referred_to="cardiology"),
    )
    result = validate_referral(CASE_B_MISSING, data)
    assert "vitals" in result.missing_fields
    assert "medications" in result.missing_fields
    assert "allergies" in result.missing_fields
    assert "referring_physician_contact" in result.missing_fields
    assert result.quality_score < 100


def test_quality_score_breakdown_is_internally_consistent():
    """§20: quality_score must always equal the sum of its own reported breakdown."""
    data = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        situation=Situation(reason_for_referral="chest pain"),
        background=Background(history="hypertension"),
        assessment=Assessment(),
        recommendation=Recommendation(referred_to="cardiology"),
    )
    result = validate_referral(CASE_B_MISSING, data)
    recomputed = (
        result.base_score
        - result.missing_critical_count * 10
        - result.conflict_count * 15
        - result.missing_optional_count * 5
    )
    assert recomputed == result.quality_score
    assert result.base_score == 100


def test_possible_duplicate_detection():
    """§51: same age/sex/destination within the time window is flagged for
    clinician review; it must never be auto-discarded (no such code path
    exists — this only asserts the flag itself is populated correctly)."""
    from app.schemas.referral import ReferralRecord, ValidationResult
    from datetime import datetime, timezone

    existing_data = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        recommendation=Recommendation(referred_to="Cardiology"),
    )
    existing = [
        ReferralRecord(
            referral_id="CLB-EXIST1",
            raw_text="a completely different referral text",
            extracted=existing_data,
            validation=ValidationResult(),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    ]
    new_data = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        recommendation=Recommendation(referred_to="cardiology"),
    )
    result = validate_referral("brand new referral text", new_data, existing_referrals=existing)
    assert result.possible_duplicates == ["CLB-EXIST1"]


def test_duplicate_detection_timezone_safety():
    """
    Regression test: duplicate detection must never raise
    `TypeError: can't subtract offset-naive and offset-aware datetimes`,
    regardless of whether a stored referral's created_at is timezone-aware
    or naive, and must correctly respect the 72h window either way.
    Covers: (a) aware+recent, (b) naive+recent, (c) explicit within-window,
    (d) explicit outside-window (both aware and naive), (e) malformed.
    """
    from app.schemas.referral import ReferralRecord, ValidationResult
    from datetime import datetime, timezone, timedelta

    def existing_with(referral_id, created_at):
        return ReferralRecord(
            referral_id=referral_id,
            raw_text=f"raw-{referral_id}",
            extracted=ExtractedReferral(
                patient=PatientDemographics(patient_age=67, patient_sex="female"),
                recommendation=Recommendation(referred_to="cardiology"),
            ),
            validation=ValidationResult(),
            created_at=created_at,
        )

    new_data = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        recommendation=Recommendation(referred_to="cardiology"),
    )

    # a) aware, recent -> flagged
    aware_recent = existing_with("R-AWARE", datetime.now(timezone.utc).isoformat())
    assert validate_referral("new", new_data, existing_referrals=[aware_recent]).possible_duplicates == ["R-AWARE"]

    # b) naive, recent -> must not raise, must still flag
    naive_recent = existing_with("R-NAIVE", datetime.now().isoformat())  # no tzinfo
    assert validate_referral("new", new_data, existing_referrals=[naive_recent]).possible_duplicates == ["R-NAIVE"]

    # c) explicit within-window (1h old, aware)
    one_hr_ago = existing_with("R-1H", (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat())
    assert validate_referral("new", new_data, existing_referrals=[one_hr_ago]).possible_duplicates == ["R-1H"]

    # d) explicit outside-window, both representations
    old_aware = existing_with("R-OLD-AWARE", (datetime.now(timezone.utc) - timedelta(hours=200)).isoformat())
    assert validate_referral("new", new_data, existing_referrals=[old_aware]).possible_duplicates == []
    old_naive = existing_with("R-OLD-NAIVE", (datetime.now() - timedelta(hours=200)).isoformat())
    assert validate_referral("new", new_data, existing_referrals=[old_naive]).possible_duplicates == []

    # e) malformed timestamp -> must not raise
    malformed = existing_with("R-BAD", "not-a-real-timestamp")
    result = validate_referral("new", new_data, existing_referrals=[malformed])
    assert isinstance(result.possible_duplicates, list)  # did not raise; exact policy covered above


def test_medication_allergy_conflict_case_d():
    data = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        background=Background(allergies=["penicillin"], medications=["amoxicillin"]),
    )
    result = validate_referral(CASE_D_CONFLICT, data)
    assert any("penicillin" in c.lower() and "amoxicillin" in c.lower() for c in result.potential_conflicts)


def test_demographic_conflict_case_c():
    data = ExtractedReferral(patient=PatientDemographics(patient_age=67, patient_sex="female"))
    result = validate_referral(CASE_C_DEMOGRAPHIC, data)
    assert any("demographic" in c.lower() for c in result.potential_conflicts)


def test_demographic_conflict_handles_age_label_variation():
    """Regression test for the 'aged N / age N' phrasing fix."""
    data = ExtractedReferral(patient=PatientDemographics(patient_age=67, patient_sex="female"))
    result = validate_referral(CASE_C_ALT_PHRASING, data)
    assert any("demographic" in c.lower() for c in result.potential_conflicts)


def test_demographic_conflict_no_false_positive_single_age():
    """The 'aged N' fix must not fire on referrals with only one age mentioned."""
    data = ExtractedReferral(patient=PatientDemographics(patient_age=67, patient_sex="female"))
    result = validate_referral(CASE_E_MESSY, data)
    assert not any("demographic" in c.lower() for c in result.potential_conflicts)


def test_missing_allergy_is_not_false_negative():
    data = ExtractedReferral(background=Background(allergies=[]))
    result = validate_referral("some referral text with no allergy mention", data)
    assert "allergies" in result.missing_fields
    assert not any("no known allergies" in f.lower() for f in result.missing_fields)


def test_score_bands():
    from app.rules.validator import band_for_score
    assert band_for_score(90) == "ready_for_review"
    assert band_for_score(70) == "needs_information"
    assert band_for_score(40) == "requires_attention"


def test_quality_score_formula_exact():
    """
    Verifies the scoring implementation exactly matches the documented
    formula: 100 - 10*missing_critical - 15*conflicts - 5*missing_optional,
    floored at 0. One case per requirement: perfect referral, one missing
    critical field, multiple missing fields, a conflict, and the floor.
    """
    perfect = ExtractedReferral(
        patient=PatientDemographics(patient_age=50, patient_sex="female"),
        situation=Situation(reason_for_referral="follow-up"),
        background=Background(history="hypertension", medications=["amlodipine"], allergies=["none reported"]),
        assessment=Assessment(vitals=Vitals(blood_pressure="120/80"), investigations=["ECG"]),
        recommendation=Recommendation(referred_to="cardiology", referring_physician_contact="Dr. X, 555-0100"),
    )
    result = validate_referral("perfect referral text", perfect)
    assert result.missing_critical_count == 0
    assert result.missing_optional_count == 0
    assert result.conflict_count == 0
    assert result.quality_score == 100  # a) perfect referral

    one_critical_missing = perfect.model_copy(deep=True)
    one_critical_missing.recommendation.referred_to = None
    result_b = validate_referral("missing one critical", one_critical_missing)
    assert result_b.missing_critical_count == 1
    assert result_b.quality_score == 90  # b) 100 - 10*1

    multiple_missing = ExtractedReferral(
        patient=PatientDemographics(patient_age=67, patient_sex="female"),
        situation=Situation(reason_for_referral="chest pain"),
        recommendation=Recommendation(referred_to="cardiology"),
    )  # referring_physician_contact critical missing; history/medications/allergies/investigations/vitals all optional-missing
    result_c = validate_referral("multiple missing", multiple_missing)
    assert result_c.missing_critical_count == 1
    assert result_c.missing_optional_count == 5
    assert result_c.quality_score == 100 - 10 * 1 - 5 * 5  # c) multiple missing fields

    with_conflict = perfect.model_copy(deep=True)
    with_conflict.background.allergies = ["Penicillin"]
    with_conflict.background.medications = ["amoxicillin"]
    result_d = validate_referral("has a conflict", with_conflict)
    assert result_d.conflict_count >= 1
    assert result_d.quality_score == 100 - 15 * result_d.conflict_count  # d) conflict penalty applied

    floor_case = ExtractedReferral(
        patient=PatientDemographics(patient_age=150, patient_sex="female"),  # present but out-of-range -> conflict, not "missing"
        background=Background(medications=["amoxicillin"], allergies=["Penicillin"]),  # conflict
        assessment=Assessment(vitals=Vitals(spo2="150%", blood_pressure="12080")),  # 2 more conflicts: spo2 range + bp format
    )
    result_e = validate_referral(
        "Patient aged 150 presenting with fatigue. Later documented age 61.",  # conflicting ages -> another conflict
        floor_case,
    )
    raw_unfloored = 100 - result_e.missing_critical_count * 10 - result_e.conflict_count * 15 - result_e.missing_optional_count * 5
    assert raw_unfloored < 0  # confirms this case genuinely exercises the floor, not just coincidentally lands on 0
    assert result_e.quality_score == 0  # floored, never negative


def test_out_of_range_spo2_flagged():
    data = ExtractedReferral(assessment=Assessment(vitals=Vitals(spo2="105%")))
    result = validate_referral("...", data)
    assert any("spo2" in c.lower() for c in result.potential_conflicts)


@requires_api_key
def test_extraction_case_e_messy_shorthand():
    from app.services.extractor import extract_clinical_fields
    result = extract_clinical_fields(CASE_E_MESSY)
    assert result.patient.patient_age == 67
    assert result.assessment.vitals.blood_pressure is not None
    assert any("pcn" in a.lower() or "penicillin" in a.lower() for a in result.background.allergies)


@requires_api_key
def test_extraction_never_fabricates_no_known_allergies():
    from app.services.extractor import extract_clinical_fields
    text = "67-year-old male referred for evaluation. Refer to general medicine."
    result = extract_clinical_fields(text)
    assert result.background.allergies == []

"""ClinBridge backend API tests — covers health, CRUD, extractor validation, conflict detection, persistence."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    login_resp = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": os.environ.get("CLINBRIDGE_DEMO_PASSWORD", "ClinBridgeDemo#2026")},
        timeout=15,
    )
    assert login_resp.status_code == 200, f"Demo login failed — is the server running with a fresh/seeded DB? {login_resp.text}"
    token = login_resp.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_health(api):
    r = api.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["service"] == "ClinBridge"


def test_list_referrals_returns_list(api):
    r = api.get(f"{BASE_URL}/api/referrals", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_basic_missing_info(api):
    payload = {"raw_text": "67-year-old female referred for chest pain. History of hypertension. Refer to cardiology."}
    r = api.post(f"{BASE_URL}/api/referrals", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["referral_id"].startswith("CLB-")
    ex = d["extracted"]
    assert ex["patient"]["patient_age"] == 67
    v = d["validation"]
    for f in ["vitals", "medications", "allergies", "investigations", "referring_physician_contact"]:
        assert f in v["missing_fields"], f"expected {f} in missing_fields, got {v['missing_fields']}"
    assert v["potential_conflicts"] == []
    assert isinstance(v["quality_score"], int) and 0 <= v["quality_score"] <= 100
    assert v["band"] == "needs_information"
    assert d["sbar"] and len(d["sbar"]) > 20
    assert d["status"] == "created"
    # persistence check
    lst = api.get(f"{BASE_URL}/api/referrals", timeout=30).json()
    assert any(x["referral_id"] == d["referral_id"] for x in lst)


def test_medication_allergy_conflict(api):
    payload = {"raw_text": "54-year-old male, community-acquired pneumonia. Penicillin allergy documented. Current medication: amoxicillin 500mg TDS. Refer to internal medicine — Dr. Rao, +91-98xxxxxx."}
    r = api.post(f"{BASE_URL}/api/referrals", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    conflicts = r.json()["validation"]["potential_conflicts"]
    joined = " ".join(conflicts).lower()
    assert "penicillin" in joined and "amoxicillin" in joined and "clinician verification" in joined, f"conflicts={conflicts}"


def test_demographic_conflict(api):
    payload = {"raw_text": "Patient aged 67 presenting with fatigue and unintentional weight loss. BP 138/86, on levothyroxine. Later documented age 61, referred to endocrinology."}
    r = api.post(f"{BASE_URL}/api/referrals", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    conflicts = r.json()["validation"]["potential_conflicts"]
    joined = " ".join(conflicts).lower()
    assert "demographic" in joined, f"conflicts={conflicts}"


def test_shorthand_extraction(api):
    payload = {"raw_text": "67F c/o CP. Hx HTN + DM. BP 160/100, SpO2 91%. On ASA + metformin. Allergy: PCN. Refer cardio."}
    r = api.post(f"{BASE_URL}/api/referrals", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    ex = r.json()["extracted"]
    assert ex["patient"]["patient_age"] == 67
    assert ex["assessment"]["vitals"]["blood_pressure"] is not None
    allergies_joined = " ".join(ex["background"]["allergies"]).lower()
    assert "pcn" in allergies_joined or "penicillin" in allergies_joined, f"allergies={ex['background']['allergies']}"


def test_get_approve_and_status_flow(api):
    payload = {"raw_text": "45-year-old male with abdominal pain. Refer to general surgery."}
    r = api.post(f"{BASE_URL}/api/referrals", json=payload, timeout=60)
    assert r.status_code == 200
    rid = r.json()["referral_id"]

    g = api.get(f"{BASE_URL}/api/referrals/{rid}", timeout=30)
    assert g.status_code == 200
    assert g.json()["referral_id"] == rid

    ap = api.post(f"{BASE_URL}/api/referrals/{rid}/approve", json={"edited_sbar": "EDITED"}, timeout=30)
    assert ap.status_code == 200

    g2 = api.get(f"{BASE_URL}/api/referrals/{rid}", timeout=30).json()
    assert g2["status"] == "approved"
    assert g2["sbar"] == "EDITED"

    ps = api.patch(f"{BASE_URL}/api/referrals/{rid}/status", params={"status": "sent"}, timeout=30)
    assert ps.status_code == 200
    assert ps.json()["status"] == "sent"

    bad = api.patch(f"{BASE_URL}/api/referrals/{rid}/status", params={"status": "invalid"}, timeout=30)
    assert bad.status_code == 400

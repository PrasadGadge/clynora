"""
ClinBridge — Auth / RBAC / Workflow State Machine / Audit / Versioning tests

Uses FastAPI's TestClient (in-process, no live server required) against an
isolated temp SQLite database, so this suite never touches
backend/clinbridge.db and never needs OPENROUTER_API_KEY (the referral
creation endpoint's extraction call IS network/LLM-dependent — those cases
are marked with the same `requires_api_key` skip pattern used in
test_pipeline.py, exactly like the rest of this repo already does).

Per-test isolation is via `monkeypatch.setenv("DATABASE_URL", ...)` only —
app/db.py resolves DATABASE_URL lazily on every connection (see
`_db_path()`), so no module reloading is needed or performed here. An
earlier version of this fixture deleted `app.*` from `sys.modules` and
re-imported everything per test to force a (then module-level) DB_PATH
constant to pick up a new value; that created a real risk of two distinct
`ReferralRecord`/`ExtractedReferral` classes existing simultaneously in the
same process, which can surface as a confusing
`ValidationError: Input should be a valid dictionary or instance of
ExtractedReferral`. That risk no longer exists.

Run with:
    pytest tests/test_auth_and_workflow.py -v
"""

import os
import tempfile
import pytest

requires_api_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY")
    or os.environ.get("OPENROUTER_API_KEY", "").strip() == "your_key_here"
    or os.environ.get("RUN_OPENROUTER_INTEGRATION_TESTS") != "1",
    reason="OPENROUTER integration tests disabled or OPENROUTER_API_KEY not set",
)


@pytest.fixture()
def client(monkeypatch):
    """
    Fresh app + fresh isolated SQLite file per test.

    Does NOT delete/re-import app.* modules (the previous version of this
    fixture did, to force a module-level DB_PATH constant to pick up a new
    DATABASE_URL -- that constant is gone now; app/db.py resolves the path
    lazily on every connection via `_db_path()`, so setting the env var
    here is sufficient on its own). Keeping a single, stable import of
    every app module for the whole test session avoids a real failure mode
    the old approach had: re-importing `app.schemas.referral` mid-session
    creates a SECOND, distinct `ReferralRecord` class, and a `ReferralRecord`
    instance built against the first class is not a `isinstance` match for
    the second -- surfacing as a confusing
    `ValidationError: Input should be a valid dictionary or instance of
    ExtractedReferral` if a value crosses that boundary. Model identity is
    now stable for the whole test run; only the database file changes.
    """
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path}")
    monkeypatch.setenv("CLINBRIDGE_SECRET_KEY", "test-secret-key-not-for-production")
    monkeypatch.setenv("CLINBRIDGE_DEMO_PASSWORD", "ClinBridgeDemo#2026")

    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    from app.security import login_limiter, extraction_limiter

    login_limiter.reset()
    extraction_limiter.reset()

    with TestClient(fastapi_app) as c:
        yield c

    login_limiter.reset()
    extraction_limiter.reset()
    os.remove(path)


def _login(client, username="admin", password=None):
    password = password or os.environ.get("CLINBRIDGE_DEMO_PASSWORD", "ClinBridgeDemo#2026")
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ===== Auth =====

def test_login_succeeds_with_correct_demo_credentials(client):
    token = _login(client, "admin")
    assert token


def test_login_fails_with_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong-password"})
    assert r.status_code == 401


def test_login_fails_for_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert r.status_code == 401


def test_protected_endpoint_rejects_missing_token(client):
    r = client.get("/api/referrals")
    assert r.status_code == 401


def test_protected_endpoint_rejects_garbage_token(client):
    r = client.get("/api/referrals", headers=_auth_headers("not-a-real-token"))
    assert r.status_code == 401


def test_protected_endpoint_accepts_valid_token(client):
    token = _login(client)
    r = client.get("/api/referrals", headers=_auth_headers(token))
    assert r.status_code == 200
    assert r.json() == []


def test_expired_token_rejected(client, monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "TOKEN_TTL_SECONDS", -10)  # any token minted now is already expired
    expired_token = auth.create_token("admin", "admin")
    r = client.get("/api/referrals", headers=_auth_headers(expired_token))
    assert r.status_code == 401


def test_inactive_user_rejected_even_with_a_still_valid_token(client):
    """
    Regression test for the get_current_user DB-revalidation fix: a token
    minted before a user is deactivated must stop working immediately, not
    just once it naturally expires.
    """
    token = _login(client, "dr.deshmukh")
    from app import db
    with db.get_connection() as conn:
        conn.execute("UPDATE users SET is_active = 0 WHERE username = ?", ("dr.deshmukh",))
    r = client.get("/api/referrals", headers=_auth_headers(token))
    assert r.status_code == 401


# ===== RBAC =====

def test_non_admin_cannot_create_clinic(client):
    token = _login(client, "coordinator1")
    r = client.post(
        "/api/clinics",
        json={
            "name": "Test Clinic", "address": "1 Test St", "locality": "Test",
            "pincode": "000000", "phone": "0", "email": "a@b.com", "specialities": [],
        },
        headers=_auth_headers(token),
    )
    assert r.status_code == 403


def test_admin_can_create_clinic(client):
    token = _login(client, "admin")
    r = client.post(
        "/api/clinics",
        json={
            "name": "Test Clinic", "address": "1 Test St", "locality": "Test",
            "pincode": "000000", "phone": "0", "email": "a@b.com", "specialities": [],
        },
        headers=_auth_headers(token),
    )
    assert r.status_code == 200, r.text


# ===== Workflow state machine (using a referral seeded directly via db, to
# avoid needing a live LLM call in every test) =====

def _seed_referral(client, token):
    from app import db
    from app.schemas.referral import ReferralRecord, ExtractedReferral, ValidationResult
    import uuid

    referral_id = f"CLB-{uuid.uuid4().hex[:6].upper()}"
    record = ReferralRecord(
        referral_id=referral_id,
        raw_text="test referral",
        extracted=ExtractedReferral(),
        validation=ValidationResult(quality_score=50, band="needs_information"),
        sbar="draft sbar",
        status="created",
    )
    db.save_referral(record)
    return referral_id


def test_valid_transition_created_to_reviewed(client):
    token = _login(client, "dr.deshmukh")
    rid = _seed_referral(client, token)
    r = client.post(f"/api/referrals/{rid}/reviewed", headers=_auth_headers(token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "reviewed"


def test_invalid_transition_created_to_sent_is_rejected(client):
    token = _login(client, "dr.deshmukh")
    rid = _seed_referral(client, token)
    r = client.post(f"/api/referrals/{rid}/send", headers=_auth_headers(token))
    assert r.status_code == 409


def test_invalid_transition_created_to_closed_is_rejected(client):
    token = _login(client, "dr.deshmukh")
    rid = _seed_referral(client, token)
    r = client.post(f"/api/referrals/{rid}/close", headers=_auth_headers(token))
    assert r.status_code == 409


def test_full_happy_path_lifecycle(client):
    referring = _login(client, "dr.deshmukh")
    receiving = _login(client, "dr.rao")
    rid = _seed_referral(client, referring)

    r = client.post(f"/api/referrals/{rid}/approve", json={}, headers=_auth_headers(referring))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    r = client.post(f"/api/referrals/{rid}/send", headers=_auth_headers(referring))
    assert r.status_code == 200
    assert r.json()["status"] == "sent"
    assert r.json()["sent_at"] is not None

    r = client.post(f"/api/referrals/{rid}/acknowledge", headers=_auth_headers(receiving))
    assert r.status_code == 200
    assert r.json()["status"] == "acknowledged"
    assert r.json()["acknowledged_by"] == "dr.rao"

    r = client.post(f"/api/referrals/{rid}/close", headers=_auth_headers(receiving))
    assert r.status_code == 200
    assert r.json()["status"] == "closed"


def test_receiving_clinician_cannot_approve(client):
    """RBAC: approving is a referring-clinician action, not a receiving-clinician one."""
    referring = _login(client, "dr.deshmukh")
    receiving = _login(client, "dr.rao")
    rid = _seed_referral(client, referring)
    r = client.post(f"/api/referrals/{rid}/approve", json={}, headers=_auth_headers(receiving))
    assert r.status_code == 403


# ===== Audit trail =====

def test_audit_events_recorded_across_lifecycle(client):
    token = _login(client, "dr.deshmukh")
    rid = _seed_referral(client, token)
    client.post(f"/api/referrals/{rid}/reviewed", headers=_auth_headers(token))
    client.post(f"/api/referrals/{rid}/approve", json={}, headers=_auth_headers(token))

    r = client.get(f"/api/referrals/{rid}/history", headers=_auth_headers(token))
    assert r.status_code == 200
    events = r.json()
    event_types = [e["event_type"] for e in events]
    assert "referral_reviewed" in event_types
    assert "referral_approved" in event_types
    for e in events:
        assert e["actor_username"] == "dr.deshmukh"


# ===== Versioning =====

def test_sbar_edit_before_approval_creates_new_version(client):
    token = _login(client, "dr.deshmukh")
    rid = _seed_referral(client, token)

    r = client.get(f"/api/referrals/{rid}/versions", headers=_auth_headers(token))
    assert r.status_code == 200
    assert r.json() == []  # seeded directly via db, not through create_referral, so no version yet

    r = client.post(
        f"/api/referrals/{rid}/approve",
        json={"edited_sbar": "clinician-edited handover text"},
        headers=_auth_headers(token),
    )
    assert r.status_code == 200
    assert r.json()["sbar"] == "clinician-edited handover text"

    r = client.get(f"/api/referrals/{rid}/versions", headers=_auth_headers(token))
    versions = r.json()
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1
    assert versions[0]["change_summary"] == "Clinician edited SBAR"


# ===== Rate Limiting & Security (Phase 2) =====

def test_login_rate_limiting(client):
    from app.security import login_limiter
    login_limiter.reset()

    # Max is 10 per minute; 10 should succeed or fail with 401, 11th must 429
    for _ in range(10):
        r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong-password"})
        assert r.status_code == 401

    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong-password"})
    assert r.status_code == 429
    assert "Rate limit exceeded" in r.json()["detail"]
    login_limiter.reset()


def test_security_headers_present_on_responses(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


# ===== Referral Ownership & Visibility Scoping (Phase 3) =====

def test_referral_ownership_visibility_scoping(client):
    from app import db
    from app.auth import hash_password
    from app.schemas.referral import ReferralRecord, ExtractedReferral, ValidationResult
    import uuid

    # Create a secondary referring clinician
    with db.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO users (username, password_hash, role, full_name, is_active) VALUES (?, ?, ?, ?, ?)",
            ("dr.other", hash_password("ClinBridgeDemo#2026"), "referring_clinician", "Dr. Other Clinician", 1),
        )

    token_deshmukh = _login(client, "dr.deshmukh")
    token_other = _login(client, "dr.other")
    token_admin = _login(client, "admin")
    token_rao = _login(client, "dr.rao")

    # Seed referral owned by dr.deshmukh and assigned to dr.rao
    rid = f"CLB-{uuid.uuid4().hex[:6].upper()}"
    record = ReferralRecord(
        referral_id=rid,
        raw_text="Test cardiac referral for Dr. Vivek Rao",
        extracted=ExtractedReferral(),
        validation=ValidationResult(quality_score=90, band="ready_for_review"),
        sbar="draft sbar",
        status="created",
        created_by="dr.deshmukh",
        assigned_to="dr.rao",
    )
    db.save_referral(record)

    # 1. Creator (dr.deshmukh) can view it
    r = client.get(f"/api/referrals/{rid}", headers=_auth_headers(token_deshmukh))
    assert r.status_code == 200

    # 2. Admin can view it
    r = client.get(f"/api/referrals/{rid}", headers=_auth_headers(token_admin))
    assert r.status_code == 200

    # 3. Assigned receiving clinician (dr.rao) can view it
    r = client.get(f"/api/referrals/{rid}", headers=_auth_headers(token_rao))
    assert r.status_code == 200

    # 4. Another unrelated referring clinician (dr.other) CANNOT view it -> 403
    r = client.get(f"/api/referrals/{rid}", headers=_auth_headers(token_other))
    assert r.status_code == 403

    # 5. List referrals filters out unauthorized records
    r_list = client.get("/api/referrals", headers=_auth_headers(token_other))
    assert r_list.status_code == 200
    ids = [item["referral_id"] for item in r_list.json()]
    assert rid not in ids

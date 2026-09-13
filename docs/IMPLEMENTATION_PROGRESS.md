# ClinBridge — Implementation Progress Log

Authority document recording the implementation state, test coverage, and feature validation for the SIH 2026 prototype.

## [COMPLETED — Full SIH 2026 Hardening Pass]

- **Security — Authentication & RBAC (backend)**: `app/auth.py` (PBKDF2 password
  hashing with 200k iterations, HMAC-signed session tokens, live DB user revalidation on every request). `app/api/auth.py` (`POST /api/auth/login`, `GET /api/auth/me`). Demo users: `admin`, `dr.deshmukh`, `dr.rao`, `coordinator1`.
- **Security — In-Memory Rate Limiting**: `app/security.py` (thread-safe sliding window rate limiter in pure Python stdlib). Capped login at 10 req/min/IP and extraction at 20 req/min/IP. Returns clean 429 with `Retry-After` header.
- **Security — Security Headers Middleware**: Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` to `app/main.py`.
- **Security — FastAPI Lifespan**: Replaced deprecated `@app.on_event("startup")` with modern `lifespan` async context manager.
- **Referral Ownership & Visibility Scoping**: Added `created_by`, `assigned_to`, and `clinic_id` to `ReferralRecord`. Enforced server-side in `app/api/referrals.py` (`_can_view_referral`):
  - Admin & Coordinator: Global / Facility oversight.
  - Referring Clinician: Scoped to referrals they created.
  - Receiving Clinician: Scoped to referrals directed to their person/specialty.
  - Unauthorized access attempts strictly return 403 Forbidden.
- **Server-side Workflow State Machine**: `app/rules/workflow.py` — full transition table + per-transition role permissions (`created` -> `reviewed` -> `approved` -> `sent` -> `acknowledged` -> `closed` and `rejected` -> `created`).
- **Activity & Audit Trail UX**: `referral_events` table + `ReferralWorkspacePage.jsx` "Audit Trail" tab displaying full interactive chronological timeline of actors, roles, transitions, and change summaries.
- **Version History & Structured Diff**: `referral_versions` table + `ReferralWorkspacePage.jsx` "Version History" tab allowing snapshot inspection and SBAR version comparisons.
- **SIH Demo Mode (6 Synthetic Scenarios)**: Added Demo Scenarios bar to `NewReferralPage.jsx` with 6 labeled cases (Clean Cardiology, Missing Vitals/Contact, Med-Allergy Conflict, Demographic Discrepancy, Messy Shorthand, Pune Specialist) clearly displaying "Synthetic Demo Data — For Demonstration Only". Executes the full live pipeline.
- **Printable Handover Report Export (PDF)**: Added `@media print` optimized Handover Report dialog in `ReferralWorkspacePage.jsx` with complete structured clinical summary, SBAR, quality score breakdown, audit stamp, and mandatory clinical safety disclaimers.
- **Documentation Quality & Workflow Analytics**: Expanded `DashboardPage.jsx` with Quality Distribution breakdown (`Ready for Review`, `Needs Information`, `Requires Attention`) and Most Frequent Missing Information gaps.
- **UI & Navigation Polish**: Replaced `window.location.href` full reload in `DashboardPage.jsx` with React Router `navigate()`; guarded `ReferralsListPage.jsx` against stale table clashes during errors; updated `DirectoryPage.jsx` booking modal with dynamic date default and error toasts.
- **Deterministic Validator**: `app/rules/validator.py` (Missing critical/optional fields, demographic regex check, medication-allergy conflict matrix, quality score formula with 0-floor clamping).
- **Duplicate Detection**: 72-hour sliding window with timezone-aware UTC normalization.
- **Comprehensive Automated Tests**: 32 unit and workflow tests in `backend/tests/` passing 100%.

## [KNOWN LIMITATIONS / ROADMAP]

- Database uses SQLite at `backend/clinbridge.db` (suitable for local SIH demo; PostgreSQL migration path is for post-SIH production).
- Live hospital-to-hospital network transmission and EHR/FHIR/ABDM integrations are roadmap items (clearly labeled as prototype workflow states).

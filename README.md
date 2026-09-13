# ClinBridge — SIH 2026

**AI-assisted clinical referral & handover quality layer.**

ClinBridge turns an unstructured clinical referral into a structured,
validated, scored, and clinician-approved SBAR handover. The clinician
remains the final decision-maker — ClinBridge does not diagnose,
prescribe, or determine urgency.

> **Status note:** This release includes: auth/RBAC with live DB revalidation,
> in-memory rate limiting, security headers, server-enforced workflow state machine,
> referral ownership & row-level visibility scoping, audit trail with interactive UI,
> referral version history with structured snapshot comparison, documentation-quality
> score with explainable arithmetic breakdown, duplicate-referral detection (72h window),
> SLA/aging workflow indicator, SIH Demo Mode (6 synthetic clinical scenarios),
> and printable/PDF Handover Report export.

## Clinical safety boundary

- ClinBridge is an **information-quality** and **handover** system, not
  a diagnostic or triage system.
- **Referral Quality Score** is a documentation-quality indicator — never
  a clinical risk or safety score.
- Missing information is never converted into a positive clinical
  finding ("Not documented" ≠ "No known allergies").
- Potential conflicts (medication↔allergy, demographic inconsistencies)
  are surfaced for **clinician verification only**.
- Clinician approval is mandatory before a referral moves forward.

## Architecture

```
React (frontend/) ── axios (Bearer token) ──► FastAPI (backend/app/) ──► SQLite
                                                     │
                                                     └─► OpenRouter LLM (server-side only)
```

- **Backend** — FastAPI + SQLite, stdlib-only auth (PBKDF2 password
  hashing + HMAC-signed session tokens — no extra dependency required).
- **Frontend** — React 19 + Tailwind CSS + TanStack React Query.
- **LLM extraction** — OpenRouter (`minimax/minimax-m3:free`),
  server-side only; the key is never sent to or read by the frontend.
- **Persistence** — SQLite at `backend/clinbridge.db` (auto-created on
  first run / via `seed.py`; **not** committed to the repo).

## Workflow state machine (server-enforced)

```
created → reviewed → approved → sent → acknowledged → closed
   ↳ any of created/reviewed/approved → rejected → created (reopen)
```

Enforced in `backend/app/rules/workflow.py` and applied on every mutating
referral endpoint — an invalid transition (e.g. `created → sent`) returns
`409`; a transition a role isn't permitted to make (e.g. a receiving
clinician approving) returns `403`. The frontend disables buttons for UX
only — it is never the source of truth.

## Auth, Ownership & Roles

Four roles, enforced server-side: `admin`, `referring_clinician`,
`receiving_clinician`, `coordinator`. Sessions are Bearer tokens
(`Authorization: Bearer <token>`), obtained from `POST /api/auth/login`.

- **Admin**: Global system visibility and administrative management.
- **Referring Clinician**: Originate, review, and approve referrals they own.
- **Receiving Clinician**: Access referrals routed to their clinic/specialty, acknowledge receipt, and close the handover loop.
- **Coordinator**: Facility-level operational oversight across the handover queue.

### Demo accounts

Seeded once, the first time the database is created (see `seed.py`):

| Username        | Role                | Full name           |
|------------------|---------------------|----------------------|
| `admin`          | admin               | Admin User           |
| `dr.deshmukh`    | referring_clinician | Dr. Aarti Deshmukh    |
| `dr.rao`         | receiving_clinician | Dr. Vivek Rao         |
| `coordinator1`   | coordinator          | Priya Coordinator     |

Shared password: value of `CLINBRIDGE_DEMO_PASSWORD` in `backend/.env`
(defaults to `ClinBridgeDemo#2026` if unset).

## Run locally

### Backend

```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
# ...then edit .env: set OPENROUTER_API_KEY, and ideally CLINBRIDGE_SECRET_KEY

python seed.py                 # creates tables + seeds demo data (idempotent)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.example .env           # Windows: copy .env.example .env

npm start
```

### Production build

```bash
cd frontend
npm run build
```

## Automated Tests

```bash
cd backend

# Full offline test suite (Auth, RBAC, Rate Limiting, Ownership, State Machine, Validator, Duplicate Detection):
.\.venv\Scripts\python.exe -m pytest tests/test_auth_and_workflow.py tests/test_pipeline.py -v -k "not test_extract"
```

## API overview

| Method | Path                                    | Auth              | Purpose                              |
|--------|------------------------------------------|-------------------|----------------------------------------|
| POST   | `/api/auth/login`                        | — (Rate Limited)  | Obtain a session token                 |
| GET    | `/api/auth/me`                           | any                | Current user info                      |
| POST   | `/api/referrals`                          | any (Rate Limited)| Create + process a referral (extract → validate → SBAR) |
| GET    | `/api/referrals`                          | scoped             | List referrals visible to user         |
| GET    | `/api/referrals/{id}`                     | scoped             | Fetch one referral (403 if unauthorized)|
| GET    | `/api/referrals/{id}/history`             | scoped             | Audit trail events                     |
| GET    | `/api/referrals/{id}/versions`            | scoped             | Version snapshot history               |
| POST   | `/api/referrals/{id}/approve`             | referring/admin    | Clinician approval (+ optional SBAR edit) |
| POST   | `/api/referrals/{id}/reviewed`            | referring/coordinator/admin | created → reviewed          |
| POST   | `/api/referrals/{id}/send`                | referring/coordinator/admin | approved → sent             |
| POST   | `/api/referrals/{id}/acknowledge`         | receiving/coordinator/admin | sent → acknowledged         |
| POST   | `/api/referrals/{id}/close`               | receiving/coordinator/admin | acknowledged → closed       |
| POST   | `/api/referrals/{id}/reject`              | any clinician role | → rejected (reason required)          |
| POST   | `/api/referrals/{id}/reopen`              | referring/coordinator/admin | rejected → created          |
| PATCH  | `/api/referrals/{id}/status`              | scoped             | Generic transition endpoint            |
| GET/POST | `/api/clinics`, `/api/doctors`, `/api/patients`, `/api/appointments` | any (writes: admin for clinics/doctors) | Pune directory + patient/appointment data |
| GET    | `/api/health`, `/health`                  | —                 | Health check                            |

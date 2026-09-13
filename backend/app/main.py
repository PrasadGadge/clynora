from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.auth import router as auth_router
from app.api.referrals import router as referrals_router
from app.api.clinics import router as clinics_router
from app.api.doctors import router as doctors_router
from app.api.patients import router as patients_router
from app.api.appointments import router as appointments_router
from app import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes the SQLite database and seeds default Pune data + demo accounts."""
    db.init_db()
    yield


app = FastAPI(
    title="ClinBridge API",
    description="AI-Assisted Clinical Referral & Handover Quality Layer — backend API",
    version="0.4.0",
    lifespan=lifespan,
)


def _allowed_origins() -> list[str]:
    """
    CORS origins come from the environment. ALLOWED_ORIGINS is a comma-separated
    list (e.g. "http://localhost:3000,https://staging.example.com"). Falls back
    to common local dev origins only -- never "*" -- so a forgotten env var
    fails safe (rejects unknown origins) rather than fails open.
    """
    raw = os.getenv("ALLOWED_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Adds standard security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Centralized fallback so an unexpected error never leaks a stack trace or
    internal implementation detail to the client. Anything that should return
    a specific status/message raises HTTPException upstream and never reaches
    this handler.
    """
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(auth_router)
app.include_router(referrals_router)
app.include_router(clinics_router)
app.include_router(doctors_router)
app.include_router(patients_router)
app.include_router(appointments_router)


@app.get("/health")
@app.get("/api/health")
def health_check():
    """Confirms the server is running and the frontend can reach it. No DB/secret detail exposed."""
    return {"status": "ok", "service": "ClinBridge"}

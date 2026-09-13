"""
ClinBridge — Server entrypoint

Supervisor runs `uvicorn server:app --host 0.0.0.0 --port 8001`.
We expose the real ClinBridge FastAPI application from app/main.py as `app`
so the uploaded backend (SQLite persistence + OpenRouter extraction) remains
the source of truth.

CORS is env-driven (ALLOWED_ORIGINS) here exactly as in app/main.py -- this
file no longer widens it to "*". Set ALLOWED_ORIGINS in backend/.env to the
actual preview/ingress origin(s) for non-local deployments.
"""

from pathlib import Path
from dotenv import load_dotenv

# Load .env BEFORE importing app modules so extractor/auth pick up
# OPENROUTER_API_KEY / CLINBRIDGE_SECRET_KEY / ALLOWED_ORIGINS.
load_dotenv(Path(__file__).parent / ".env", override=True)

from app.main import app  # noqa: E402


@app.get("/api/health")
def api_health():
    return {"status": "ok", "service": "ClinBridge"}

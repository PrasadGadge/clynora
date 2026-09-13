"""
ClinBridge — Authentication & Authorization

Deliberately built on the Python standard library only (hashlib, hmac,
secrets, base64, json) so it does not add new third-party dependencies
to requirements.txt. If this moves beyond prototype/demo use, swap
`hash_password`/`verify_password` for passlib[bcrypt] and the token
functions for a vetted JWT library (python-jose / PyJWT) — the function
signatures below are written so that swap is a drop-in change.

Design:
- Passwords are never stored in plaintext. PBKDF2-HMAC-SHA256, 200k
  iterations, random 16-byte salt per user (broadly comparable in cost
  to bcrypt's default work factor; NIST-recommended KDF).
- Sessions are stateless signed tokens (HMAC-SHA256 over a JSON payload,
  base64url-encoded) carrying {sub, role, exp}. Same security property
  as a JWT (tamper-evident, server-verified signature) without pulling
  in a JWT library. Verification rejects expired or tampered tokens.
- SECRET_KEY MUST come from the environment in any non-local deployment.
  A random key is generated at process start ONLY as a local-dev
  fallback so the app doesn't crash without a .env — every server
  restart invalidates existing sessions in that fallback case, which is
  intentional (forces you to set a real secret for anything persistent).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# ===== Configuration =====

SECRET_KEY = os.getenv("CLINBRIDGE_SECRET_KEY") or secrets.token_hex(32)
TOKEN_TTL_SECONDS = int(os.getenv("CLINBRIDGE_SESSION_TTL_SECONDS", "28800"))  # 8h default
PBKDF2_ITERATIONS = 200_000

ROLES = ("admin", "referring_clinician", "receiving_clinician", "coordinator")

_bearer = HTTPBearer(auto_error=False)


# ===== Password hashing =====

def hash_password(plain_password: str) -> str:
    """Returns 'pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>'."""
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(derived).decode()}"


def verify_password(plain_password: str, stored_hash: str) -> bool:
    try:
        algo, iterations_s, salt_b64, hash_b64 = stored_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iterations_s)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False
    derived = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(derived, expected)


# ===== Session tokens (HMAC-signed, JWT-equivalent security properties) =====

def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def create_token(username: str, role: str) -> str:
    payload = {"sub": username, "role": role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(signature)}"


def decode_token(token: str) -> dict:
    """Raises ValueError on any tamper/expiry/format failure."""
    try:
        payload_b64, signature_b64 = token.split(".")
    except ValueError:
        raise ValueError("Malformed token")

    expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    given_sig = _b64url_decode(signature_b64)
    if not hmac.compare_digest(expected_sig, given_sig):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_b64))
    if payload.get("exp", 0) < time.time():
        raise ValueError("Token expired")
    return payload


# ===== FastAPI dependencies =====

class CurrentUser:
    def __init__(self, username: str, role: str):
        self.username = username
        self.role = role


def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> CurrentUser:
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"})

    # Revalidate against the live database on every request rather than trusting
    # the role baked into the token at login time. Without this, deactivating a
    # user or changing their role would have no effect until their (up to
    # TOKEN_TTL_SECONDS-old) token expires -- a real gap for a system with
    # admin-managed roles. Lazy import avoids a circular import (db.py imports
    # from this module).
    from app import db

    record = db.get_user(payload["sub"])
    if record is None or not record.get("is_active"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is inactive or no longer exists", headers={"WWW-Authenticate": "Bearer"})

    return CurrentUser(username=record["username"], role=record["role"])


def require_role(*allowed_roles: str):
    """Dependency factory: require_role('admin', 'coordinator')."""

    def _checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Role '{user.role}' is not permitted to perform this action")
        return user

    return _checker

"""ClinBridge — Authentication API routes."""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from app import db
from app.auth import verify_password, create_token, get_current_user, CurrentUser
from app.security import login_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    role: str
    full_name: str


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request):
    login_limiter.check(request)
    user = db.get_user(payload.username)
    # Constant-shape error regardless of whether the username exists, so the
    # endpoint doesn't leak which usernames are valid.
    if not user or not user.get("is_active") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")

    token = create_token(username=user["username"], role=user["role"])
    return LoginResponse(token=token, username=user["username"], role=user["role"], full_name=user["full_name"])


@router.get("/me", response_model=LoginResponse)
def me(user: CurrentUser = Depends(get_current_user)):
    record = db.get_user(user.username)
    if not record:
        raise HTTPException(401, "User no longer exists")
    return LoginResponse(token="", username=record["username"], role=record["role"], full_name=record["full_name"])

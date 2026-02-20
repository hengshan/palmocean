"""Sprint 1 — Auth API routes (v1 prefix, delegates to existing auth service)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse,
    register_user, authenticate_user, get_token_pair, require_auth, UserModel,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth-v1"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    try:
        user = register_user(db, body.email, body.username, body.password)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return get_token_pair(user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    return get_token_pair(user)


@router.get("/me", response_model=UserResponse)
def get_me(user: UserModel = Depends(require_auth)):
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,
        created_at=user.created_at,
    )

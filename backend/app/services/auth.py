"""
Phase 12: JWT Authentication service.

Simple JWT auth with user registration, login, and token refresh.
Uses SQLite for user storage (same DB as projects/features).
"""

import os
import uuid
import hashlib
import hmac
import json
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, Header
from pydantic import BaseModel

from app.database import Base, get_db

logger = logging.getLogger(__name__)

# JWT secret — use env var in production
def _generate_jwt_secret() -> str:
    """Generate or load a persistent JWT secret."""
    secret_file = Path(__file__).resolve().parent.parent.parent / "storage" / ".jwt_secret"
    if secret_file.exists():
        return secret_file.read_text().strip()
    # First run: generate a strong 256-bit secret
    import secrets
    secret = secrets.token_hex(32)
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    secret_file.write_text(secret)
    secret_file.chmod(0o600)
    return secret

JWT_SECRET = os.environ.get("GEO_JWT_SECRET") or _generate_jwt_secret()
JWT_EXPIRY = 86400 * 7  # 7 days
JWT_REFRESH_EXPIRY = 86400 * 30  # 30 days


# --- User Model ---

class UserModel(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # "admin" | "user"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# --- Pydantic Schemas ---

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = JWT_EXPIRY
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    created_at: datetime | None = None


# --- Password hashing ---

def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()
    return f"{salt}:{h}"


def _verify_password(password: str, stored: str) -> bool:
    salt, h = stored.split(":")
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()
    return hmac.compare_digest(h, check)


# --- JWT ---

def _b64url_encode(data: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    import base64
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def create_token(user_id: str, username: str, role: str, expiry: int = JWT_EXPIRY) -> str:
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload_data = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + expiry,
    }
    payload = _b64url_encode(json.dumps(payload_data).encode())
    signature = hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    sig = _b64url_encode(signature)
    return f"{header}.{payload}.{sig}"


def verify_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, sig = parts
        expected = hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_decode(sig), expected):
            return None
        data = json.loads(_b64url_decode(payload))
        if data.get("exp", 0) < time.time():
            return None
        return data
    except Exception:
        return None


# --- Auth functions ---

def register_user(db: Session, email: str, username: str, password: str) -> UserModel:
    if db.query(UserModel).filter(UserModel.email == email).first():
        raise ValueError("Email already registered")
    if db.query(UserModel).filter(UserModel.username == username).first():
        raise ValueError("Username already taken")

    user = UserModel(
        id=str(uuid.uuid4()),
        email=email,
        username=username,
        password_hash=_hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> UserModel | None:
    user = db.query(UserModel).filter(UserModel.email == email).first()
    if not user or not _verify_password(password, user.password_hash):
        return None
    return user


def get_token_pair(user: UserModel) -> TokenResponse:
    access = create_token(user.id, user.username, user.role, JWT_EXPIRY)
    refresh = create_token(user.id, user.username, user.role, JWT_REFRESH_EXPIRY)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user={"id": user.id, "email": user.email, "username": user.username, "role": user.role},
    )


# --- FastAPI dependency ---

def get_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> UserModel | None:
    """
    Extract current user from Authorization header.
    Returns None if no auth (allows anonymous access).
    """
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    data = verify_token(token)
    if not data:
        return None
    user = db.query(UserModel).filter(UserModel.id == data["sub"]).first()
    return user


def require_auth(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> UserModel:
    """Require authenticated user — raises 401 if not logged in."""
    user = get_current_user(authorization, db)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


def require_admin(
    user: UserModel = Depends(require_auth),
) -> UserModel:
    """Require admin role."""
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user

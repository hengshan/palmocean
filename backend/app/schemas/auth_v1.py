"""Schemas for Sprint 1 auth API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


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
    expires_in: int
    user: dict


class UserMeResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    created_at: datetime | None = None

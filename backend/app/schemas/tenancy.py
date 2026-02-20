"""Pydantic schemas for tenancy domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Org ───────────────────────────────────────────────────────────────
class OrgCreate(BaseModel):
    name: str
    slug: str
    plan: str = "free"
    settings: dict | None = None


class OrgResponse(BaseModel):
    org_id: uuid.UUID
    name: str
    slug: str
    plan: str
    settings: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


# ── User ──────────────────────────────────────────────────────────────
class UserResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    name: str | None = None
    avatar_url: str | None = None
    is_superadmin: bool = False
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


# ── Project (backwards-compatible) ────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    region: str | None = None
    settings: dict | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    region: str | None = None
    settings: dict | None = None


class ProjectResponse(BaseModel):
    project_id: uuid.UUID
    org_id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    region: str | None = None
    settings: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    # Legacy compat fields
    id: str | None = None
    feature_count: int = 0
    image_count: int = 0
    model_config = {"from_attributes": True}


# ── Membership ────────────────────────────────────────────────────────
class InviteMemberRequest(BaseModel):
    email: str
    role_id: uuid.UUID | None = None


class MemberResponse(BaseModel):
    membership_id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


# ── AuditLog ──────────────────────────────────────────────────────────
class AuditLogResponse(BaseModel):
    audit_id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID | None = None
    action: str
    target_type: str
    target_id: uuid.UUID | None = None
    payload: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

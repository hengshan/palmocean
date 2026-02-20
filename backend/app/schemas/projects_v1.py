"""Schemas for Sprint 1 projects API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectCreateV1(BaseModel):
    org_id: uuid.UUID
    name: str
    description: str | None = None
    region: str | None = None


class ProjectCreated(BaseModel):
    project_id: uuid.UUID
    name: str


class ProjectDetailV1(BaseModel):
    project_id: uuid.UUID
    org_id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    region: str | None = None
    settings: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    stats: dict | None = None
    model_config = {"from_attributes": True}


class ProjectListV1(BaseModel):
    projects: list[ProjectDetailV1]


class ProjectUpdateV1(BaseModel):
    name: str | None = None
    description: str | None = None
    region: str | None = None
    settings: dict | None = None

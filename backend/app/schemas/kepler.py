"""Pydantic schemas for Kepler map config domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class MapConfigCreate(BaseModel):
    title: str
    description: str | None = None
    kepler_config: dict
    dataset_refs: list[dict] = []
    tags: list[str] | None = None


class MapConfigResponse(BaseModel):
    map_config_id: uuid.UUID
    project_id: uuid.UUID
    version: int
    title: str
    description: str | None = None
    kepler_config: dict
    dataset_refs: list[dict]
    tags: list[str] | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class MapConfigReleaseCreate(BaseModel):
    map_config_id: uuid.UUID
    channel: str = "production"
    notes: str | None = None


class MapConfigReleaseResponse(BaseModel):
    release_id: uuid.UUID
    map_config_id: uuid.UUID
    channel: str
    released_at: datetime | None = None
    notes: str | None = None
    model_config = {"from_attributes": True}


class MapConfigShareCreate(BaseModel):
    map_config_id: uuid.UUID
    visibility: str
    permissions: dict | None = None
    expires_at: datetime | None = None


class MapConfigShareResponse(BaseModel):
    share_id: uuid.UUID
    map_config_id: uuid.UUID
    visibility: str
    token: str | None = None
    permissions: dict
    expires_at: datetime | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

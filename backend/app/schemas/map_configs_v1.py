"""Schemas for Sprint 1 map-configs API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class MapConfigCreateV1(BaseModel):
    project_id: uuid.UUID
    title: str
    kepler_config: dict
    dataset_refs: list[dict] = []
    parent_id: uuid.UUID | None = None


class MapConfigCreated(BaseModel):
    map_config_id: uuid.UUID
    version: int


class MapConfigDetail(BaseModel):
    map_config_id: uuid.UUID
    project_id: uuid.UUID
    version: int
    title: str
    kepler_config: dict
    dataset_refs: list[dict]
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class MapConfigListResponse(BaseModel):
    configs: list[MapConfigDetail]


class ReleaseRequest(BaseModel):
    channel: str  # "prod"|"staging"|"demo"


class ShareRequest(BaseModel):
    visibility: str  # "org"|"public_link"
    expires_at: datetime | None = None


class ShareResponse(BaseModel):
    share_id: uuid.UUID
    token: str
    url: str

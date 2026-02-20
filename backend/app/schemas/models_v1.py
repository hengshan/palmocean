"""Schemas for Sprint 1 models API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ModelVersionItem(BaseModel):
    version_id: uuid.UUID
    version: str
    status: str
    metrics: dict | None = None
    input_spec: dict | None = None
    output_spec: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ModelItem(BaseModel):
    model_id: uuid.UUID
    name: str
    task_type: str
    description: str | None = None
    versions: list[ModelVersionItem] = []
    model_config = {"from_attributes": True}


class ModelList(BaseModel):
    models: list[ModelItem]


class ModelVersionList(BaseModel):
    versions: list[ModelVersionItem]

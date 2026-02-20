"""Pydantic schemas for ML / inference domain."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ModelCreate(BaseModel):
    name: str
    slug: str
    task_type: str
    description: str | None = None


class ModelResponse(BaseModel):
    model_id: uuid.UUID
    org_id: uuid.UUID
    name: str
    slug: str
    task_type: str
    description: str | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ModelVersionCreate(BaseModel):
    version: str
    artifact_uri: str
    artifact_format: str | None = None
    input_spec: dict
    output_spec: dict
    notes: str | None = None


class ModelVersionResponse(BaseModel):
    model_version_id: uuid.UUID
    model_id: uuid.UUID
    version: str
    status: str
    artifact_uri: str
    metrics: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class InferenceJobCreate(BaseModel):
    model_version_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    roi_id: uuid.UUID | None = None
    name: str | None = None
    params: dict | None = None
    priority: int = 0


class InferenceJobResponse(BaseModel):
    job_id: uuid.UUID
    project_id: uuid.UUID
    model_version_id: uuid.UUID
    status: str
    progress: float = 0
    error: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    model_config = {"from_attributes": True}


class InferenceOutputResponse(BaseModel):
    output_id: uuid.UUID
    job_id: uuid.UUID
    output_type: str
    format: str
    uri: str
    tile_endpoint: str | None = None
    stats: dict | None = None
    size_bytes: int | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


# Legacy compat (from old schemas/inference.py)
class PointCoord(BaseModel):
    lng: float
    lat: float


class BBox(BaseModel):
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float


class PointPrompt(BaseModel):
    image_id: str
    point: PointCoord
    label: int = 1


class BoxPrompt(BaseModel):
    image_id: str
    bbox: BBox


class AutoPrompt(BaseModel):
    image_id: str
    bbox: BBox | None = None


class InferenceStats(BaseModel):
    count: int
    total_area: float


class SemanticPrompt(BaseModel):
    image_id: str
    classes: list[str] = Field(default_factory=lambda: ["building", "road", "vegetation", "water", "solar_panel"])
    bbox: BBox | None = None


class TextPrompt(BaseModel):
    image_id: str
    prompt: str
    bbox: BBox | None = None


class InferenceResponse(BaseModel):
    task_id: str
    status: str = "completed"
    results: dict[str, Any] = Field(
        default_factory=lambda: {"type": "FeatureCollection", "features": []}
    )
    stats: InferenceStats = Field(default_factory=lambda: InferenceStats(count=0, total_area=0.0))

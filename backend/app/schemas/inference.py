from __future__ import annotations

import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


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


# ── Persist schemas ───────────────────────────────────────────────────

class PersistRequest(BaseModel):
    """Request body for POST /api/inference/persist"""
    project_id: str | None = None
    plantation_id: str | None = None
    model_slug: str = Field(..., description="e.g. sam2, yolov8n, remoteclip")
    task_type: str = Field(..., description="segmentation | detection | text_retrieval")
    prompt_type: str = Field(..., description="point | box | auto | text | semantic")
    prompt_params: dict[str, Any] | None = None
    geojson: dict[str, Any] = Field(..., description="InferenceResponse.results — FeatureCollection")
    stats: dict[str, Any] | None = None
    inference_time_ms: int | None = None
    image_url: str | None = None


class PersistResponse(BaseModel):
    """Response for POST /api/inference/persist"""
    id: uuid.UUID
    created_at: datetime
    permalink: str


class SavedResultResponse(BaseModel):
    """Response for GET /api/inference/results/{id}"""
    id: uuid.UUID
    plantation_id: uuid.UUID | None
    project_id: uuid.UUID | None
    model_slug: str
    task_type: str
    prompt_type: str
    prompt_params: dict[str, Any] | None
    geojson: dict[str, Any]
    stats: dict[str, Any] | None
    inference_time_ms: int | None
    image_url: str | None
    created_at: datetime


class SavedResultListItem(BaseModel):
    """Compact item for listing saved results"""
    id: uuid.UUID
    plantation_id: uuid.UUID | None
    model_slug: str
    task_type: str
    stats: dict[str, Any] | None
    created_at: datetime


class SavedResultListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[SavedResultListItem]

"""Extended schemas for Sprint 1 inference API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class InferenceJobSubmit(BaseModel):
    project_id: uuid.UUID
    task_type: str
    model_version_id: uuid.UUID | None = None
    aoi: dict  # GeoJSON Polygon
    params: dict | None = None


class InferenceJobQueued(BaseModel):
    job_id: uuid.UUID
    status: str = "queued"


class InferenceJobDetail(BaseModel):
    job_id: uuid.UUID
    project_id: uuid.UUID
    model_version_id: uuid.UUID
    status: str
    progress: float = 0
    error: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    outputs: list[dict] | None = None
    model_config = {"from_attributes": True}


class InferenceJobList(BaseModel):
    jobs: list[InferenceJobDetail]
    total: int


class InferenceOutputItem(BaseModel):
    output_id: uuid.UUID
    output_type: str
    format: str
    uri: str
    bbox: dict | None = None
    stats: dict | None = None
    model_config = {"from_attributes": True}


class InferenceOutputList(BaseModel):
    outputs: list[InferenceOutputItem]


class WSProgress(BaseModel):
    type: str = "progress"
    tile: int
    total: int
    pct: float


class WSPartialResult(BaseModel):
    type: str = "partial_result"
    geojson: dict


class WSComplete(BaseModel):
    type: str = "complete"
    job_id: str
    duration: float
    stats: dict


class WSError(BaseModel):
    type: str = "error"
    message: str

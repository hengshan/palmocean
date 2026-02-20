"""Pydantic schemas for v1 data API (upload, STAC, GEE)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Upload / Dataset ──────────────────────────────────────────────────

class DatasetMeta(BaseModel):
    dataset_id: uuid.UUID
    name: str
    original_name: str
    uri: str
    bounds: list[float] | None = None
    crs: str | None = None
    resolution: list[float] | None = None
    width: int | None = None
    height: int | None = None
    bands: dict | None = None
    file_size: int | None = None
    source_type: str = "upload"
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class DatasetListResponse(BaseModel):
    datasets: list[DatasetMeta]
    total: int


class DatasetUploadResponse(BaseModel):
    dataset_id: uuid.UUID
    name: str
    uri: str
    bounds: list[float] | None = None
    crs: str | None = None
    resolution: list[float] | None = None
    bands: dict | None = None
    file_size: int | None = None


# ── STAC ──────────────────────────────────────────────────────────────

class STACSearchRequest(BaseModel):
    provider: str
    collection: str
    bbox: list[float] | None = None
    datetime: str | None = Field(None, description="e.g. 2024-01-01/2024-12-31")
    limit: int = Field(20, ge=1, le=100)
    query: dict[str, Any] | None = None


class STACItemResult(BaseModel):
    id: str
    datetime: str | None = None
    bbox: list[float] | None = None
    cloud_cover: float | None = None
    thumbnail: str | None = None
    assets: dict[str, Any] = {}
    properties: dict[str, Any] = {}


class STACSearchResponse(BaseModel):
    provider: str
    collection: str
    items: list[STACItemResult]
    total: int


class STACImportRequest(BaseModel):
    provider: str
    collection: str
    item_id: str
    asset_key: str = "visual"
    project_id: uuid.UUID


class STACImportResponse(BaseModel):
    dataset_id: uuid.UUID
    uri: str
    status: str = "imported"


class STACProviderInfo(BaseModel):
    name: str
    url: str
    requires_auth: bool = False
    popular_collections: list[str] = []


class STACCollectionInfo(BaseModel):
    id: str
    title: str | None = None
    description: str | None = None
    extent: dict | None = None
    license: str | None = None


# ── GEE ───────────────────────────────────────────────────────────────

class GEECollectionInfo(BaseModel):
    id: str
    name: str
    description: str | None = None
    spatial_resolution: int | None = None
    temporal_resolution: str | None = None
    bands: list[str] = []
    default_vis: dict | None = None


class GEESearchRequest(BaseModel):
    collection: str
    bbox: list[float] = Field(..., min_length=4, max_length=4)
    date_start: str
    date_end: str
    limit: int = Field(20, ge=1, le=100)
    cloud_cover_max: float | None = Field(None, ge=0, le=100)


class GEEImageResult(BaseModel):
    id: str
    datetime: int | None = None
    bands: list[str] = []
    properties: dict[str, Any] = {}


class GEESearchResponse(BaseModel):
    collection: str
    images: list[GEEImageResult]
    total: int


class GEEExportRequest(BaseModel):
    image_id: str
    bbox: list[float] = Field(..., min_length=4, max_length=4)
    scale: int = 10
    bands: list[str] | None = None
    project_id: uuid.UUID


class GEEExportResponse(BaseModel):
    task_id: str
    status: str = "started"
    message: str | None = None

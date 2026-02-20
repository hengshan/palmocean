"""Schemas for Sprint 1 assets API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ImageryAssetCreateV1(BaseModel):
    project_id: uuid.UUID
    asset_type: str
    source_type: str
    uri: str
    footprint: dict | None = None  # GeoJSON
    bands: dict | None = None
    crs: str = "EPSG:4326"


class ImageryAssetDetailV1(BaseModel):
    asset_id: uuid.UUID
    project_id: uuid.UUID
    name: str | None = None
    asset_type: str
    source_type: str
    uri: str
    crs: str
    bands: dict | None = None
    size_bytes: int | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ImageryAssetListV1(BaseModel):
    assets: list[ImageryAssetDetailV1]


class ROICreateV1(BaseModel):
    project_id: uuid.UUID
    name: str
    geom: dict  # GeoJSON
    source: str = "manual"


class ROIDetailV1(BaseModel):
    roi_id: uuid.UUID
    project_id: uuid.UUID
    name: str | None = None
    source: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ROIListV1(BaseModel):
    rois: list[ROIDetailV1]

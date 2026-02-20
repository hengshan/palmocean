"""Pydantic schemas for spatial assets domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class FarmCreate(BaseModel):
    name: str
    farm_type: str = "palm_plantation"
    geom: dict | None = None  # GeoJSON
    props: dict | None = None


class FarmResponse(BaseModel):
    farm_id: uuid.UUID
    org_id: uuid.UUID
    project_id: uuid.UUID
    name: str
    farm_type: str
    area_ha: float | None = None
    props: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class BlockCreate(BaseModel):
    name: str
    geom: dict  # GeoJSON
    planting_year: int | None = None
    props: dict | None = None


class BlockResponse(BaseModel):
    block_id: uuid.UUID
    farm_id: uuid.UUID
    name: str
    planting_year: int | None = None
    props: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ROICreate(BaseModel):
    name: str | None = None
    geom: dict  # GeoJSON
    source: str = "manual"
    props: dict | None = None


class ROIResponse(BaseModel):
    roi_id: uuid.UUID
    project_id: uuid.UUID
    name: str | None = None
    source: str
    props: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ImageryAssetCreate(BaseModel):
    name: str | None = None
    asset_type: str
    source_type: str
    uri: str
    format: str | None = None
    acquired_at: datetime | None = None
    gsd_cm: int | None = None
    bands: dict | None = None
    crs: str = "EPSG:4326"
    props: dict | None = None


class ImageryAssetResponse(BaseModel):
    asset_id: uuid.UUID
    org_id: uuid.UUID
    project_id: uuid.UUID
    name: str | None = None
    asset_type: str
    source_type: str
    uri: str
    format: str | None = None
    acquired_at: datetime | None = None
    gsd_cm: int | None = None
    crs: str
    size_bytes: int | None = None
    tile_endpoint: str | None = None
    props: dict | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}

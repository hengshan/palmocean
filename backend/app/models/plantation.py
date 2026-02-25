"""Plantation and PlantationAsset persistence models."""

import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from pydantic import BaseModel, Field

from app.database import Base


class AssetType(str, enum.Enum):
    palm_tree = "palm_tree"
    robot = "robot"
    building = "building"
    sensor = "sensor"


class PlantationModel(Base):
    __tablename__ = "plantations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    location = Column(JSON, nullable=True)   # GeoJSON Point
    boundary = Column(JSON, nullable=True)   # GeoJSON Polygon
    area_hectares = Column(Float, nullable=True)
    tree_count = Column(Integer, nullable=True)
    health_score = Column(Float, nullable=True)  # 0.0 – 1.0
    owner_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    assets = relationship("PlantationAsset", back_populates="plantation", cascade="all, delete-orphan")


class PlantationAsset(Base):
    __tablename__ = "plantation_assets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    plantation_id = Column(String, ForeignKey("plantations.id", ondelete="CASCADE"), nullable=False)
    asset_type = Column(Enum(AssetType), nullable=False)
    position = Column(JSON, nullable=True)   # {x, y, z}
    asset_metadata = Column(JSON, nullable=True)
    model_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    plantation = relationship("PlantationModel", back_populates="assets")


# --- Pydantic Schemas ---

class PlantationCreate(BaseModel):
    name: str
    description: str | None = None
    location: dict | None = None    # GeoJSON Point
    boundary: dict | None = None    # GeoJSON Polygon
    area_hectares: float | None = None
    tree_count: int | None = None
    health_score: float | None = Field(None, ge=0.0, le=1.0)
    owner_id: str | None = None


class PlantationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    location: dict | None = None
    boundary: dict | None = None
    area_hectares: float | None = None
    tree_count: int | None = None
    health_score: float | None = Field(None, ge=0.0, le=1.0)
    owner_id: str | None = None


class PlantationResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    location: dict | None = None
    boundary: dict | None = None
    area_hectares: float | None = None
    tree_count: int | None = None
    health_score: float | None = None
    owner_id: str | None = None
    asset_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PlantationDetailResponse(PlantationResponse):
    assets: list["PlantationAssetResponse"] = []


class PlantationAssetCreate(BaseModel):
    asset_type: AssetType
    position: dict | None = None  # {x, y, z}
    asset_metadata: dict | None = None
    model_url: str | None = None


class PlantationAssetUpdate(BaseModel):
    asset_type: AssetType | None = None
    position: dict | None = None
    asset_metadata: dict | None = None
    model_url: str | None = None


class PlantationAssetResponse(BaseModel):
    id: str
    plantation_id: str
    asset_type: AssetType
    position: dict | None = None
    asset_metadata: dict | None = None
    model_url: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# Resolve forward reference
PlantationDetailResponse.model_rebuild()

"""Project and Feature persistence models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from pydantic import BaseModel, Field

from app.database import Base


class ProjectModel(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    bounds = Column(JSON, nullable=True)  # [west, south, east, north]
    settings = Column(JSON, nullable=True)  # classes, confidence threshold, etc.
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    features = relationship("FeatureModel", back_populates="project", cascade="all, delete-orphan")
    images = relationship("ProjectImage", back_populates="project", cascade="all, delete-orphan")


class FeatureModel(Base):
    __tablename__ = "features"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    geometry = Column(JSON, nullable=False)  # GeoJSON geometry object
    feature_class = Column(String, nullable=False, default="unknown")
    confidence = Column(Float, nullable=True)
    area_sq_m = Column(Float, nullable=True)
    source = Column(String, nullable=False, default="ai")  # "ai" | "manual"
    properties = Column(JSON, nullable=True)  # additional metadata
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("ProjectModel", back_populates="features")


class ProjectImage(Base):
    """Link table between projects and uploaded images."""
    __tablename__ = "project_images"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    image_id = Column(String, ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("ProjectModel", back_populates="images")


# --- Pydantic Schemas ---

class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    bounds: list[float] | None = None
    settings: dict | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    bounds: list[float] | None = None
    settings: dict | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    bounds: list[float] | None = None
    settings: dict | None = None
    feature_count: int = 0
    image_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class FeatureCreate(BaseModel):
    geometry: dict
    feature_class: str = "unknown"
    confidence: float | None = None
    area_sq_m: float | None = None
    source: str = "manual"
    properties: dict | None = None


class FeatureUpdate(BaseModel):
    feature_class: str | None = None
    confidence: float | None = None
    properties: dict | None = None


class FeatureResponse(BaseModel):
    id: str
    project_id: str
    geometry: dict
    feature_class: str
    confidence: float | None = None
    area_sq_m: float | None = None
    source: str
    properties: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class BatchDeleteRequest(BaseModel):
    ids: list[str]


class BatchClassUpdate(BaseModel):
    ids: list[str]
    feature_class: str


class FeatureImport(BaseModel):
    """Import a GeoJSON FeatureCollection into a project."""
    features: list[dict]  # GeoJSON features with geometry + properties

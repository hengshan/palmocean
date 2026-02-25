"""PalmOcean — IoT / Time-series data models for TimescaleDB.

Separate Base for palmocean (different DB connection from main palmview PostgreSQL).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSON, UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

Uuid = PgUUID(as_uuid=True)


class PalmOceanBase(DeclarativeBase):
    """Separate declarative base for PalmOcean TimescaleDB models."""
    pass


# ── plantations ──────────────────────────────────────────────────────────────
class Plantation(PalmOceanBase):
    __tablename__ = "plantations"

    plantation_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)  # reference only, no FK (different DB)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    region: Mapped[str | None] = mapped_column(String(255))
    area_ha: Mapped[float | None] = mapped_column(Float)
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active")  # active/inactive/monitoring
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    # Relationships
    tree_assets: Mapped[list["TreeAsset"]] = relationship(back_populates="plantation", cascade="all, delete-orphan")
    health_snapshots: Mapped[list["TreeHealthSnapshot"]] = relationship(
        back_populates="plantation", cascade="all, delete-orphan"
    )
    iot_events: Mapped[list["IoTEvent"]] = relationship(back_populates="plantation", cascade="all, delete-orphan")


# ── tree_assets ──────────────────────────────────────────────────────────────
class TreeAsset(PalmOceanBase):
    __tablename__ = "tree_assets"
    __table_args__ = (
        Index("ix_tree_assets_plantation", "plantation_id"),
        Index("ix_tree_assets_geometry", "geometry", postgresql_using="gist"),
    )

    tree_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    plantation_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("plantations.plantation_id"), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))  # from GeoAI inference job
    source_job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # which inference job created this
    geometry = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    height_m: Mapped[float | None] = mapped_column(Float)
    crown_radius_m: Mapped[float | None] = mapped_column(Float)
    age_years: Mapped[int | None] = mapped_column(Integer)
    variety: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="active")  # active/removed/dead
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    # Relationships
    plantation: Mapped["Plantation"] = relationship(back_populates="tree_assets")
    health_snapshots: Mapped[list["TreeHealthSnapshot"]] = relationship(back_populates="tree", cascade="all, delete-orphan")


# ── tree_health_snapshots (TimescaleDB hypertable) ───────────────────────────
class TreeHealthSnapshot(PalmOceanBase):
    __tablename__ = "tree_health_snapshots"
    __table_args__ = (
        Index("ix_health_plantation_time", "plantation_id", "timestamp"),
        Index("ix_health_tree_time", "tree_id", "timestamp"),
    )

    snapshot_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tree_assets.tree_id"), nullable=False)
    plantation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("plantations.plantation_id"), nullable=False
    )  # for efficient partitioned queries
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # TimescaleDB partition key
    health_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0.0-1.0
    ndvi: Mapped[float | None] = mapped_column(Float)
    canopy_coverage: Mapped[float | None] = mapped_column(Float)
    disease_flags: Mapped[dict | None] = mapped_column(JSON)  # {"spots": true, "yellowing": false}
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # "satellite", "drone", "sensor", "manual"
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # inference job that generated this
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON)

    # Relationships
    tree: Mapped["TreeAsset"] = relationship(back_populates="health_snapshots")
    plantation: Mapped["Plantation"] = relationship(back_populates="health_snapshots")


# ── iot_events (TimescaleDB hypertable) ──────────────────────────────────────
class IoTEvent(PalmOceanBase):
    __tablename__ = "iot_events"
    __table_args__ = (
        Index("ix_iot_plantation_time", "plantation_id", "timestamp"),
        Index("ix_iot_device_time", "device_id", "timestamp"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    plantation_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("plantations.plantation_id"), nullable=False)
    tree_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tree_assets.tree_id"))
    device_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)  # "temperature", "humidity", "soil_moisture", "harvest"
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # partition key
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    raw_payload: Mapped[dict | None] = mapped_column(JSON)

    # Relationships
    plantation: Mapped["Plantation"] = relationship(back_populates="iot_events")

"""Domain 2+3+5: Spatial Assets — farms, blocks, rois, imagery_assets, stac_remotes, stac_asset_links."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.database import Base

Uuid = PgUUID(as_uuid=True)


# ── farms ─────────────────────────────────────────────────────────────
class Farm(Base):
    __tablename__ = "farms"
    __table_args__ = (
        Index("ix_farms_geom", "geom", postgresql_using="gist"),
        Index("ix_farms_project", "project_id"),
    )

    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    farm_type: Mapped[str] = mapped_column(String(50), nullable=False, default="palm_plantation")
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    area_ha: Mapped[float | None] = mapped_column(Numeric(12, 4))
    props: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    blocks: Mapped[list[Block]] = relationship(back_populates="farm", cascade="all, delete-orphan")


# ── blocks ────────────────────────────────────────────────────────────
class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (
        Index("ix_blocks_geom", "geom", postgresql_using="gist"),
        Index("ix_blocks_farm", "farm_id"),
    )

    block_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("farms.farm_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=False)
    planting_year: Mapped[int | None] = mapped_column(Integer)
    props: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    farm: Mapped[Farm] = relationship(back_populates="blocks")


# ── rois ──────────────────────────────────────────────────────────────
class ROI(Base):
    __tablename__ = "rois"
    __table_args__ = (
        Index("ix_rois_geom", "geom", postgresql_using="gist"),
        Index("ix_rois_project", "project_id"),
    )

    roi_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    geom = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="manual")
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    props: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── imagery_assets ────────────────────────────────────────────────────
class ImageryAsset(Base):
    __tablename__ = "imagery_assets"
    __table_args__ = (
        Index("ix_imagery_assets_footprint", "footprint", postgresql_using="gist"),
        Index("ix_imagery_assets_project_time", "project_id", "acquired_at"),
        Index("ix_imagery_assets_source_type", "source_type"),
        Index("ix_imagery_assets_asset_type", "asset_type"),
    )

    asset_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    uri: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str | None] = mapped_column(String(30))
    stac_link_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("stac_asset_links.link_id"))
    gee_export_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # FK to gee_exports (Phase 2)
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    gsd_cm: Mapped[int | None] = mapped_column(Integer)
    bands: Mapped[dict | None] = mapped_column(JSON)
    crs: Mapped[str] = mapped_column(String(30), default="EPSG:4326")
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    checksum: Mapped[str | None] = mapped_column(String(64))
    tile_endpoint: Mapped[str | None] = mapped_column(Text)
    props: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── stac_remotes ──────────────────────────────────────────────────────
class StacRemote(Base):
    __tablename__ = "stac_remotes"
    __table_args__ = (Index("ix_stac_remotes_project", "project_id"),)

    stac_remote_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    stac_api_url: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[dict | None] = mapped_column(JSON, default=dict)
    default_collection: Mapped[str | None] = mapped_column(String(255))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")


# ── stac_asset_links ──────────────────────────────────────────────────
class StacAssetLink(Base):
    __tablename__ = "stac_asset_links"
    __table_args__ = (
        UniqueConstraint("stac_api_url", "collection_id", "item_id", "asset_key", name="uq_stac_link"),
        Index("ix_stac_asset_links_footprint", "footprint", postgresql_using="gist"),
        Index("ix_stac_asset_links_project_time", "project_id", "acquired_at"),
    )

    link_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    stac_api_url: Mapped[str | None] = mapped_column(Text)
    collection_id: Mapped[str] = mapped_column(String(255), nullable=False)
    item_id: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_key: Mapped[str | None] = mapped_column(String(100))
    asset_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("imagery_assets.asset_id"))
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    gsd_cm: Mapped[int | None] = mapped_column(Integer)
    cloud_cover_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    bands: Mapped[dict | None] = mapped_column(JSON)
    platform: Mapped[str | None] = mapped_column(String(100))
    props: Mapped[dict | None] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

"""Domain 8: Kepler Map Config Versioning."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    ARRAY,
)
from sqlalchemy.dialects.postgresql import JSON, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

Uuid = PgUUID(as_uuid=True)


# ── map_configs ───────────────────────────────────────────────────────
class MapConfig(Base):
    __tablename__ = "map_configs"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_map_configs_project_ver"),
        Index("ix_map_configs_project_time", "project_id", "created_at"),
        Index("ix_map_configs_parent", "parent_id"),
    )

    map_config_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("map_configs.map_config_id"))
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    kepler_config: Mapped[dict] = mapped_column(JSON, nullable=False)
    dataset_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    tags = mapped_column(ARRAY(Text), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    releases: Mapped[list[MapConfigRelease]] = relationship(back_populates="map_config")
    shares: Mapped[list[MapConfigShare]] = relationship(back_populates="map_config")


# ── map_config_releases ───────────────────────────────────────────────
class MapConfigRelease(Base):
    __tablename__ = "map_config_releases"
    __table_args__ = (
        Index("ix_map_config_releases_config", "map_config_id"),
    )

    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    map_config_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("map_configs.map_config_id"), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), nullable=False, default="production")
    released_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.user_id"), nullable=False)
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    notes: Mapped[str | None] = mapped_column(Text)

    map_config: Mapped[MapConfig] = relationship(back_populates="releases")


# ── map_config_shares ─────────────────────────────────────────────────
class MapConfigShare(Base):
    __tablename__ = "map_config_shares"
    __table_args__ = (
        Index("ix_map_config_shares_config", "map_config_id"),
        Index("ix_map_config_shares_token", "token", postgresql_where="token IS NOT NULL"),
    )

    share_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    map_config_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("map_configs.map_config_id"), nullable=False)
    visibility: Mapped[str] = mapped_column(String(30), nullable=False)
    token: Mapped[str | None] = mapped_column(String(64), unique=True)
    permissions: Mapped[dict] = mapped_column(JSON, default=lambda: {"view": True})
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    map_config: Mapped[MapConfig] = relationship(back_populates="shares")

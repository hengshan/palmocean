"""Domain 6: Model Registry & Inference Workflow."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
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


# ── models ────────────────────────────────────────────────────────────
class Model(Base):
    __tablename__ = "models"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_models_org_slug"),
    )

    model_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    versions: Mapped[list[ModelVersion]] = relationship(back_populates="model", cascade="all, delete-orphan")


# ── model_versions ────────────────────────────────────────────────────
class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        UniqueConstraint("model_id", "version", name="uq_model_versions_ver"),
        Index("ix_model_versions_status", "model_id", "status"),
    )

    model_version_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    model_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("models.model_id"), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft")
    artifact_uri: Mapped[str] = mapped_column(Text, nullable=False)
    artifact_format: Mapped[str | None] = mapped_column(String(30))
    artifact_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    artifact_checksum: Mapped[str | None] = mapped_column(String(64))
    input_spec: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_spec: Mapped[dict] = mapped_column(JSON, nullable=False)
    metrics: Mapped[dict | None] = mapped_column(JSON, default=dict)
    provenance: Mapped[dict | None] = mapped_column(JSON, default=dict)
    runtime_config: Mapped[dict | None] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    model: Mapped[Model] = relationship(back_populates="versions")


# ── inference_jobs ────────────────────────────────────────────────────
class InferenceJob(Base):
    __tablename__ = "inference_jobs"
    __table_args__ = (
        Index("ix_inference_jobs_org_project", "org_id", "project_id"),
        Index("ix_inference_jobs_status", "status", postgresql_where="status IN ('pending','queued','running')"),
    )

    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    model_version_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("model_versions.model_version_id"), nullable=False)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("imagery_assets.asset_id"))
    roi_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("rois.roi_id"))
    name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    params: Mapped[dict | None] = mapped_column(JSON, default=dict)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    input_snapshot: Mapped[dict | None] = mapped_column(JSON)
    worker_id: Mapped[str | None] = mapped_column(String(100))
    progress: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    outputs: Mapped[list[InferenceOutput]] = relationship(back_populates="job", cascade="all, delete-orphan")


# ── inference_outputs ─────────────────────────────────────────────────
class InferenceOutput(Base):
    __tablename__ = "inference_outputs"
    __table_args__ = (
        Index("ix_inference_outputs_job", "job_id"),
        Index("ix_inference_outputs_bbox", "bbox", postgresql_using="gist"),
    )

    output_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("inference_jobs.job_id"), nullable=False)
    output_type: Mapped[str] = mapped_column(String(30), nullable=False)
    format: Mapped[str] = mapped_column(String(30), nullable=False)
    uri: Mapped[str] = mapped_column(Text, nullable=False)
    tile_endpoint: Mapped[str | None] = mapped_column(Text)
    bbox = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    crs: Mapped[str] = mapped_column(String(30), default="EPSG:4326")
    stats: Mapped[dict | None] = mapped_column(JSON, default=dict)
    manifest: Mapped[dict | None] = mapped_column(JSON, default=dict)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("imagery_assets.asset_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    job: Mapped[InferenceJob] = relationship(back_populates="outputs")


# ── inference_result_index ────────────────────────────────────────────
class InferenceResultIndex(Base):
    __tablename__ = "inference_result_index"
    __table_args__ = (
        Index("ix_result_index_geom", "geom", postgresql_using="gist"),
        Index("ix_result_index_project_time", "project_id", "time_key"),
        Index("ix_result_index_label", "label_key"),
        Index("ix_result_index_model", "model_version_id"),
        Index("ix_result_index_roi", "roi_id"),
    )

    idx_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orgs.org_id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.project_id"), nullable=False)
    output_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("inference_outputs.output_id"), nullable=False)
    model_version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("model_versions.model_version_id"))
    task_type: Mapped[str | None] = mapped_column(String(50))
    label_key: Mapped[str | None] = mapped_column(String(100))
    time_key: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    geom = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    roi_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("rois.roi_id"))
    feature_count: Mapped[int | None] = mapped_column(Integer)
    confidence_mean: Mapped[float | None] = mapped_column(Numeric(5, 4))
    props: Mapped[dict | None] = mapped_column(JSON, default=dict)

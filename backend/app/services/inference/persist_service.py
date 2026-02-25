"""
GeoAI Inference Persist Service — Phase 1 (inline storage, no auth deps).

Saves inference results to `inference_result_drafts` table.
Phase 2: link to InferenceJob/Output + MinIO artifact storage.
"""

from __future__ import annotations

import uuid
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.ml import InferenceResultDraft

logger = logging.getLogger(__name__)


# ── Write ──────────────────────────────────────────────────────────────

def persist_result(
    *,
    model_slug: str,
    task_type: str,
    prompt_type: str,
    geojson: dict[str, Any],
    stats: dict[str, Any] | None = None,
    prompt_params: dict[str, Any] | None = None,
    plantation_id: str | None = None,
    project_id: str | None = None,
    inference_time_ms: int | None = None,
    image_url: str | None = None,
) -> InferenceResultDraft:
    """Persist an inference result to the DB and return the saved record."""
    db: Session = SessionLocal()
    try:
        draft = InferenceResultDraft(
            id=uuid.uuid4(),
            plantation_id=uuid.UUID(plantation_id) if plantation_id else None,
            project_id=uuid.UUID(project_id) if project_id else None,
            model_slug=model_slug,
            task_type=task_type,
            prompt_type=prompt_type,
            prompt_params=prompt_params or {},
            geojson=geojson,
            stats=stats or {},
            inference_time_ms=inference_time_ms,
            image_url=image_url,
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)
        logger.info("Persisted inference result %s (model=%s, task=%s)", draft.id, model_slug, task_type)
        return draft
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Read ───────────────────────────────────────────────────────────────

def get_result(result_id: str) -> InferenceResultDraft | None:
    """Fetch a single saved result by ID."""
    db: Session = SessionLocal()
    try:
        return db.query(InferenceResultDraft).filter(
            InferenceResultDraft.id == uuid.UUID(result_id)
        ).first()
    finally:
        db.close()


def list_results(
    *,
    project_id: str | None = None,
    plantation_id: str | None = None,
    model_slug: str | None = None,
    task_type: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[int, list[InferenceResultDraft]]:
    """Return (total_count, page_items) for saved results with optional filters."""
    db: Session = SessionLocal()
    try:
        q = db.query(InferenceResultDraft)
        if project_id:
            q = q.filter(InferenceResultDraft.project_id == uuid.UUID(project_id))
        if plantation_id:
            q = q.filter(InferenceResultDraft.plantation_id == uuid.UUID(plantation_id))
        if model_slug:
            q = q.filter(InferenceResultDraft.model_slug == model_slug)
        if task_type:
            q = q.filter(InferenceResultDraft.task_type == task_type)
        total = q.count()
        items = (
            q.order_by(InferenceResultDraft.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return total, items
    finally:
        db.close()

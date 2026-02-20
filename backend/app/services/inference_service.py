"""Inference job management service — background task execution with WebSocket progress."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.ml import InferenceJob, InferenceOutput, ModelVersion

logger = logging.getLogger(__name__)

# In-memory registry of active WebSocket connections per job
_ws_subscribers: dict[uuid.UUID, list[asyncio.Queue]] = {}


def subscribe(job_id: uuid.UUID) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _ws_subscribers.setdefault(job_id, []).append(q)
    return q


def unsubscribe(job_id: uuid.UUID, q: asyncio.Queue):
    subs = _ws_subscribers.get(job_id, [])
    if q in subs:
        subs.remove(q)
    if not subs:
        _ws_subscribers.pop(job_id, None)


async def _broadcast(job_id: uuid.UUID, msg: dict):
    for q in _ws_subscribers.get(job_id, []):
        await q.put(msg)


async def run_inference_background(
    job_id: uuid.UUID,
    db_url: str,
    model_version_id: uuid.UUID,
    aoi: dict,
    params: dict | None,
):
    """
    Background coroutine that simulates inference execution.
    In production, replace with actual model invocation / task queue integration.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(db_url)
    SessionLocal = sessionmaker(bind=engine)

    db = SessionLocal()
    try:
        job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
        if not job:
            return

        # Mark running
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        total_tiles = params.get("tiles", 100) if params else 100
        start = asyncio.get_event_loop().time()

        for i in range(1, total_tiles + 1):
            await asyncio.sleep(0.05)  # simulate work
            pct = round(i / total_tiles, 4)
            job.progress = pct * 100
            db.commit()
            await _broadcast(job_id, {
                "type": "progress",
                "tile": i,
                "total": total_tiles,
                "pct": pct,
            })

        # Create output
        output = InferenceOutput(
            org_id=job.org_id,
            job_id=job.job_id,
            output_type="vector",
            format="geojson",
            uri=f"/outputs/{job_id}/result.geojson",
            stats={"tile_count": total_tiles, "feature_count": 0},
        )
        db.add(output)

        duration = asyncio.get_event_loop().time() - start
        job.status = "completed"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        db.commit()

        await _broadcast(job_id, {
            "type": "complete",
            "job_id": str(job_id),
            "duration": round(duration, 2),
            "stats": {"tile_count": total_tiles},
        })

    except Exception as e:
        logger.exception("Inference job %s failed", job_id)
        job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
        if job:
            job.status = "failed"
            job.error = str(e)
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        await _broadcast(job_id, {"type": "error", "message": str(e)})
    finally:
        db.close()
        engine.dispose()

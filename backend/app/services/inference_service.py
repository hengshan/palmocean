"""Inference job management service — background task execution with WebSocket progress.

Generates GeoJSON FeatureCollection results via SAM2 inference server when available,
falling back to realistic mock palm-tree detections otherwise.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import random
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.ml import InferenceJob, InferenceOutput, ModelVersion

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# WebSocket pub/sub
# ---------------------------------------------------------------------------

_ws_subscribers: dict[uuid.UUID, list[asyncio.Queue]] = {}

# In-memory GeoJSON cache — keyed by str(job_id).
# Cleared on restart; for MVP demo this is acceptable.
_output_cache: dict[str, dict] = {}


def get_cached_geojson(job_id: str) -> dict | None:
    """Retrieve cached GeoJSON for a completed job."""
    return _output_cache.get(job_id)


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


# ---------------------------------------------------------------------------
# GeoJSON generation helpers (mock fallback)
# ---------------------------------------------------------------------------

def _aoi_bbox(aoi: dict) -> tuple[float, float, float, float]:
    """Extract (min_lng, min_lat, max_lng, max_lat) from a GeoJSON geometry / bbox dict."""
    if "bbox" in aoi:
        b = aoi["bbox"]
        return (b[0], b[1], b[2], b[3])

    coords: list | None = None
    geom = aoi.get("geometry", aoi)
    gtype = geom.get("type", "")
    if gtype == "Polygon":
        coords = geom["coordinates"][0]
    elif gtype == "MultiPolygon":
        coords = [pt for ring in geom["coordinates"] for pt in ring[0]]
    elif "coordinates" in geom:
        coords = geom["coordinates"] if isinstance(geom["coordinates"][0], (list, tuple)) else [geom["coordinates"]]

    if coords:
        lngs = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        return (min(lngs), min(lats), max(lngs), max(lats))

    # Fallback: a small default area (Hainan, China — palm-tree friendly)
    return (109.5, 18.1, 110.0, 18.6)


def _generate_tile_ids(bbox: tuple[float, float, float, float], total_tiles: int) -> list[str]:
    """Generate deterministic tile IDs based on bbox grid."""
    cols = max(1, int(math.ceil(math.sqrt(total_tiles))))
    rows = max(1, math.ceil(total_tiles / cols))
    tiles = []
    for r in range(rows):
        for c in range(cols):
            if len(tiles) >= total_tiles:
                break
            tiles.append(f"tile_{r:03d}_{c:03d}")
    return tiles


def _generate_detections(
    bbox: tuple[float, float, float, float],
    tile_id: str,
    model_name: str,
    rng: random.Random,
) -> list[dict]:
    """Generate random palm-tree point detections within a tile sub-region."""
    min_lng, min_lat, max_lng, max_lat = bbox
    count = rng.randint(2, 12)
    features = []
    for i in range(count):
        lng = rng.uniform(min_lng, max_lng)
        lat = rng.uniform(min_lat, max_lat)
        confidence = round(rng.uniform(0.55, 0.99), 4)
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(lng, 7), round(lat, 7)],
            },
            "properties": {
                "confidence": confidence,
                "class_name": "palm_tree",
                "model_name": model_name,
                "tile_id": tile_id,
                "detection_id": str(uuid.uuid4()),
            },
        })
    return features


# ---------------------------------------------------------------------------
# SAM2 service integration
# ---------------------------------------------------------------------------

async def _check_sam2_health(base_url: str) -> bool:
    """Check whether the SAM2 inference server is reachable and ready."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base_url}/health")
            if resp.status_code == 200:
                data = resp.json()
                logger.info("SAM2 health: %s", data)
                return data.get("status") == "ok"
    except Exception as e:
        logger.debug("SAM2 health check failed: %s", e)
    return False


async def _call_sam2_auto(
    base_url: str,
    image_path: str,
    bbox: tuple[float, float, float, float],
) -> list[dict] | None:
    """
    Call /segment/auto on the SAM2 server.

    Returns list of GeoJSON Feature dicts, or None on failure.
    """
    try:
        import httpx
        payload = {
            "image_path": image_path,
            "bbox": list(bbox),
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{base_url}/segment/auto", json=payload)
            resp.raise_for_status()
            data = resp.json()
            features = data.get("features", [])
            logger.info("SAM2 /segment/auto returned %d features", len(features))
            return features
    except Exception as e:
        logger.warning("SAM2 /segment/auto call failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Main background runner
# ---------------------------------------------------------------------------

async def run_inference_background(
    job_id: uuid.UUID,
    db_url: str,
    model_version_id: uuid.UUID,
    aoi: dict,
    params: dict | None,
):
    """
    Background coroutine that runs inference and produces a GeoJSON
    FeatureCollection.

    Strategy:
    1. Check SAM2 server availability (GET /health).
    2. If available → call /segment/auto with the AOI bbox.
    3. If not available → fall back to mock tile-based detection.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

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

        bbox = _aoi_bbox(aoi)
        model_name = params.get("model_name", "palm-det-v1") if params else "palm-det-v1"
        start = asyncio.get_event_loop().time()

        # --- Broadcast start ---
        await _broadcast(job_id, {
            "type": "progress",
            "completed": 0,
            "total": 100,
            "percent": 0,
            "current_tile": "initialising",
        })

        # ------------------------------------------------------------------
        # Attempt SAM2 inference
        # ------------------------------------------------------------------
        sam2_base_url: str = settings.inference_api_url  # e.g. "http://localhost:8001"
        sam2_available = await _check_sam2_health(sam2_base_url)
        all_features: list[dict] = []
        used_sam2 = False

        if sam2_available:
            logger.info("SAM2 server available — calling /segment/auto for job %s", job_id)
            await _broadcast(job_id, {
                "type": "progress",
                "completed": 10,
                "total": 100,
                "percent": 10,
                "current_tile": "sam2_inference",
            })

            # Determine image path from params (optional)
            image_path: str | None = (params or {}).get("image_path")

            if image_path:
                sam2_features = await _call_sam2_auto(sam2_base_url, image_path, bbox)
                if sam2_features is not None:
                    all_features = sam2_features
                    used_sam2 = True

            # If no image_path or SAM2 call failed, fall through to mock

            if used_sam2:
                job.progress = 90
                db.commit()
                await _broadcast(job_id, {
                    "type": "progress",
                    "completed": 90,
                    "total": 100,
                    "percent": 90,
                    "current_tile": "sam2_complete",
                })
            else:
                logger.info("SAM2 available but no image_path provided — using mock fallback")

        # ------------------------------------------------------------------
        # Mock fallback (also used when no image_path provided)
        # ------------------------------------------------------------------
        if not used_sam2:
            if sam2_available:
                logger.info(
                    "SAM2 available but falling back to mock (no image_path for job %s)", job_id
                )
            else:
                logger.info("SAM2 not available — using mock fallback for job %s", job_id)

            total_tiles = params.get("tiles", 16) if params else 16
            tile_ids = _generate_tile_ids(bbox, total_tiles)
            total_tiles = len(tile_ids)
            rng = random.Random(str(job_id))

            for i, tile_id in enumerate(tile_ids, 1):
                await asyncio.sleep(rng.uniform(0.03, 0.10))  # simulate work

                cols = max(1, int(math.ceil(math.sqrt(total_tiles))))
                rows = max(1, math.ceil(total_tiles / cols))
                col_idx = (i - 1) % cols
                row_idx = (i - 1) // cols
                lng_step = (bbox[2] - bbox[0]) / cols
                lat_step = (bbox[3] - bbox[1]) / rows
                tile_bbox = (
                    bbox[0] + col_idx * lng_step,
                    bbox[1] + row_idx * lat_step,
                    bbox[0] + (col_idx + 1) * lng_step,
                    bbox[1] + (row_idx + 1) * lat_step,
                )

                tile_features = _generate_detections(tile_bbox, tile_id, model_name, rng)
                all_features.extend(tile_features)

                pct = round(i / total_tiles * 100, 2)
                job.progress = pct
                db.commit()

                await _broadcast(job_id, {
                    "type": "progress",
                    "completed": i,
                    "total": total_tiles,
                    "percent": pct,
                    "current_tile": tile_id,
                })

        # ------------------------------------------------------------------
        # Persist result
        # ------------------------------------------------------------------
        geojson_result = {
            "type": "FeatureCollection",
            "features": all_features,
        }

        # Cache GeoJSON in memory so it can be served via HTTP route
        _output_cache[str(job_id)] = geojson_result

        result_uri = f"/api/v1/inference/jobs/{job_id}/geojson"

        output = InferenceOutput(
            org_id=job.org_id,
            job_id=job.job_id,
            output_type="vector",
            format="geojson",
            uri=result_uri,
            stats={
                "feature_count": len(all_features),
                "source": "sam2" if used_sam2 else "mock",
            },
        )
        db.add(output)

        duration = asyncio.get_event_loop().time() - start
        job.status = "completed"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        db.commit()

        await _broadcast(job_id, {
            "type": "complete",
            "result_url": result_uri,
            "geojson": geojson_result,  # Inline GeoJSON for direct Kepler rendering via WebSocket
            "summary": {
                "total_detections": len(all_features),
                "model_name": model_name,
                "source": "sam2" if used_sam2 else "mock",
                "duration_seconds": round(duration, 2),
            },
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

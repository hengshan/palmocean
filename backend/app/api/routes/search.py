"""Semantic search routes — text-to-region search + feature extraction."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import settings
from app.services.clip_search import clip_search_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


# --- Models ---

class TextSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=10, ge=1, le=50)
    region: str | None = Field(default=None)
    segment: bool = Field(default=False, description="Run SAM2 segmentation on top results")


class MultiSearchRequest(BaseModel):
    queries: list[str] = Field(..., min_length=1, max_length=10)
    top_k: int = Field(default=5, ge=1, le=20)


# --- Routes ---

@router.get("/status")
def search_status():
    return clip_search_service.status()


@router.post("/build")
def build_index(data_dir: str | None = None):
    result = clip_search_service.build_index(data_dir)
    return result


@router.post("/text")
def search_text(req: TextSearchRequest):
    result = clip_search_service.search_text(
        query=req.query,
        top_k=req.top_k,
        region=req.region,
    )

    # Auto-run dense search on top tiles for feature boundaries
    if req.segment and result.get("results"):
        for r in result["results"][:3]:
            try:
                dense = clip_search_service.dense_search(
                    query=req.query,
                    tile_file=r["file"],
                    threshold=0.15,
                )
                r["features"] = dense.get("features", [])
                r["heatmap_stats"] = dense.get("heatmap_stats")
            except Exception as e:
                logger.warning("Dense search failed for %s: %s", r["file"], e)
                r["features"] = []

    return result


@router.post("/multi")
def search_multi(req: MultiSearchRequest):
    return clip_search_service.search_multi(queries=req.queries, top_k=req.top_k)


@router.get("/regions")
def list_regions():
    if not clip_search_service.is_ready:
        return {"regions": [], "message": "Index not built yet"}
    return {
        "regions": list({m["region"] for m in clip_search_service._tile_metadata}),
        "total_tiles": len(clip_search_service._tile_metadata),
    }


@router.get("/tiles")
def list_tiles():
    """List all indexed tiles with their bounds (for rendering on map)."""
    if not clip_search_service.is_ready:
        return {"tiles": []}
    return {
        "tiles": [
            {"file": m["file"], "bounds": m["bounds"], "region": m["region"]}
            for m in clip_search_service._tile_metadata
        ]
    }


class DenseSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    tile_file: str = Field(..., description="Tile filename (e.g. kota_tinggi_7.tif)")
    tile_size: int = Field(default=224, ge=64, le=512)
    stride: int = Field(default=112, ge=32, le=256)
    threshold: float = Field(default=0.15, ge=0.0, le=1.0)


@router.post("/dense")
def dense_search(req: DenseSearchRequest):
    """
    Dense sub-tile search: slide a window across a tile, compute per-patch
    CLIP similarity, extract contour polygons for high-similarity regions.
    
    Returns GeoJSON features with boundaries of matching areas.
    """
    return clip_search_service.dense_search(
        query=req.query,
        tile_file=req.tile_file,
        tile_size=req.tile_size,
        stride=req.stride,
        threshold=req.threshold,
    )


@router.get("/dense/heatmap/{tile_file}")
def dense_heatmap(tile_file: str, query: str = Query(...)):
    """
    Get a similarity heatmap PNG overlay for a tile + text query.
    Use as an image overlay on the map.
    """
    data = clip_search_service.dense_search_heatmap_png(
        query=query,
        tile_file=tile_file,
    )
    if data is None:
        return Response(status_code=404, content="Failed to generate heatmap")
    return Response(
        content=data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/tile-image/{filename}")
def get_tile_image(filename: str):
    """Serve a tile GeoTIFF as a PNG image for map overlay."""
    import numpy as np
    import rasterio
    from PIL import Image
    import io

    tile_path = Path(settings.tile_data_dir) / filename
    if not tile_path.exists() or not filename.endswith(".tif"):
        return Response(status_code=404, content="Tile not found")

    try:
        with rasterio.open(str(tile_path)) as src:
            n = min(3, src.count)
            bands = [src.read(i + 1).astype(np.float32) for i in range(n)]
            while len(bands) < 3:
                bands.append(bands[0])

            def norm(b):
                valid = b[b > 0]
                if len(valid) == 0:
                    return np.zeros_like(b, dtype=np.uint8)
                p2, p98 = np.percentile(valid, [2, 98])
                return np.clip((b - p2) / (p98 - p2 + 1e-6) * 255, 0, 255).astype(np.uint8)

            rgb = np.stack([norm(b) for b in bands], axis=-1)

            # Create alpha channel (transparent where all bands are 0)
            alpha = np.where(
                (bands[0] > 0) | (bands[1] > 0) | (bands[2] > 0),
                255, 0
            ).astype(np.uint8)

            rgba = np.dstack([rgb, alpha])
            img = Image.fromarray(rgba, "RGBA")

            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            buf.seek(0)

            return Response(
                content=buf.getvalue(),
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=86400"},
            )
    except Exception as e:
        logger.error("Failed to render tile %s: %s", filename, e)
        return Response(status_code=500, content=str(e))

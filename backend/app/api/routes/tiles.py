"""Phase 11: Tile serving + viewport-based feature loading."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.image import ImageModel
from app.models.project import FeatureModel
from app.services.tiling import get_tile

router = APIRouter(tags=["tiles"])


@router.get("/api/images/{image_id}/tiles/{z}/{x}/{y}.png")
def serve_tile(image_id: str, z: int, x: int, y: int, db: Session = Depends(get_db)):
    """Serve an XYZ tile for the given image."""
    img = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not img:
        raise HTTPException(404, "Image not found")

    tile_bytes = get_tile(img.file_path, image_id, z, x, y)
    if not tile_bytes:
        # Return transparent 1x1 PNG for empty tiles
        return Response(
            content=b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82',
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    return Response(
        content=tile_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/api/projects/{project_id}/features/viewport")
def get_features_in_viewport(
    project_id: str,
    west: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    north: float = Query(...),
    limit: int = Query(500, le=2000),
    min_confidence: float = Query(0.0),
    feature_class: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Load features within a map viewport bounding box.
    Uses JSON geometry bbox check (approximate, good enough for SQLite).
    For PostGIS, replace with ST_Intersects.
    """
    q = db.query(FeatureModel).filter(FeatureModel.project_id == project_id)

    if min_confidence > 0:
        q = q.filter(FeatureModel.confidence >= min_confidence)
    if feature_class:
        q = q.filter(FeatureModel.feature_class == feature_class)

    # For SQLite with JSON geometry, we do a rough bbox filter
    # by checking if any coordinate falls within the viewport.
    # This is approximate but fast. PostGIS would use spatial index.
    features = q.order_by(FeatureModel.confidence.desc()).limit(limit * 3).all()

    # Filter by bbox in Python (until PostGIS migration)
    in_viewport = []
    for f in features:
        if _geometry_intersects_bbox(f.geometry, west, south, east, north):
            in_viewport.append(f)
            if len(in_viewport) >= limit:
                break

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f.id,
                "geometry": f.geometry,
                "properties": {
                    "id": f.id,
                    "class": f.feature_class,
                    "confidence": f.confidence,
                    "area_sq_m": f.area_sq_m,
                    "source": f.source,
                    **(f.properties or {}),
                },
            }
            for f in in_viewport
        ],
        "_meta": {
            "total_in_project": q.count(),
            "returned": len(in_viewport),
            "viewport": [west, south, east, north],
        },
    }


def _geometry_intersects_bbox(
    geometry: dict, west: float, south: float, east: float, north: float
) -> bool:
    """Check if a GeoJSON geometry intersects a bounding box (approximate)."""
    if not geometry:
        return False

    geom_type = geometry.get("type", "")
    coords = geometry.get("coordinates", [])

    try:
        if geom_type == "Point":
            lng, lat = coords[0], coords[1]
            return west <= lng <= east and south <= lat <= north

        elif geom_type == "Polygon":
            return _ring_intersects_bbox(coords[0], west, south, east, north)

        elif geom_type == "MultiPolygon":
            return any(
                _ring_intersects_bbox(polygon[0], west, south, east, north)
                for polygon in coords
            )
    except (IndexError, TypeError):
        pass

    return True  # Default to include if we can't parse


def _ring_intersects_bbox(
    ring: list, west: float, south: float, east: float, north: float
) -> bool:
    """Check if any point in a coordinate ring falls within bbox."""
    for coord in ring:
        if west <= coord[0] <= east and south <= coord[1] <= north:
            return True
    # Also check if bbox is inside the ring (ring completely contains viewport)
    # Simple check: ring bbox overlaps viewport bbox
    lngs = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    ring_west, ring_east = min(lngs), max(lngs)
    ring_south, ring_north = min(lats), max(lats)
    return not (ring_east < west or ring_west > east or ring_north < south or ring_south > north)

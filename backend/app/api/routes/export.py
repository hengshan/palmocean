"""Export endpoints — GeoJSON, CSV, Shapefile downloads."""

import csv
import io
import json
import zipfile
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import FeatureModel, ProjectModel

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])


def _get_features(project_id: str, db: Session) -> list[FeatureModel]:
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return db.query(FeatureModel).filter(FeatureModel.project_id == project_id).all()


@router.get("/geojson")
def export_geojson(project_id: str, db: Session = Depends(get_db)):
    features = _get_features(project_id, db)
    fc = {
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
            for f in features
        ],
    }
    content = json.dumps(fc, indent=2)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="palmview-{project_id[:8]}.geojson"'},
    )


@router.get("/csv")
def export_csv(project_id: str, db: Session = Depends(get_db)):
    features = _get_features(project_id, db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "class", "confidence", "area_sq_m", "source", "geometry_type", "centroid_lng", "centroid_lat"])
    for f in features:
        geom = f.geometry or {}
        geom_type = geom.get("type", "")
        # Approximate centroid from first coordinate
        coords = geom.get("coordinates", [])
        try:
            if geom_type == "Polygon" and coords:
                ring = coords[0]
                lng = sum(c[0] for c in ring) / len(ring)
                lat = sum(c[1] for c in ring) / len(ring)
            elif geom_type == "MultiPolygon" and coords:
                ring = coords[0][0]
                lng = sum(c[0] for c in ring) / len(ring)
                lat = sum(c[1] for c in ring) / len(ring)
            else:
                lng, lat = None, None
        except (IndexError, TypeError, ZeroDivisionError):
            lng, lat = None, None
        writer.writerow([f.id, f.feature_class, f.confidence, f.area_sq_m, f.source, geom_type, lng, lat])
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="palmview-{project_id[:8]}.csv"'},
    )


@router.get("/summary")
def export_summary(project_id: str, db: Session = Depends(get_db)):
    """Project statistics summary."""
    features = _get_features(project_id, db)
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    by_class: dict[str, dict] = {}
    for f in features:
        cls = f.feature_class
        if cls not in by_class:
            by_class[cls] = {"count": 0, "total_area": 0.0, "avg_confidence": 0.0, "confidences": []}
        by_class[cls]["count"] += 1
        by_class[cls]["total_area"] += f.area_sq_m or 0
        if f.confidence is not None:
            by_class[cls]["confidences"].append(f.confidence)
    for cls, stats in by_class.items():
        confs = stats.pop("confidences")
        stats["avg_confidence"] = sum(confs) / len(confs) if confs else None
    return {
        "project": {"id": project.id, "name": project.name},
        "total_features": len(features),
        "ai_features": sum(1 for f in features if f.source == "ai"),
        "manual_features": sum(1 for f in features if f.source == "manual"),
        "by_class": by_class,
    }

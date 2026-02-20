"""Feature CRUD endpoints — Phase 6 full persistence."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import (
    FeatureModel, FeatureCreate, FeatureUpdate, FeatureResponse,
    BatchDeleteRequest, BatchClassUpdate, FeatureImport, ProjectModel,
)

router = APIRouter(tags=["features"])


def _to_geojson_feature(f: FeatureModel) -> dict:
    return {
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


# --- Per-project features ---

@router.get("/api/projects/{project_id}/features")
def get_project_features(
    project_id: str,
    feature_class: str | None = Query(None),
    min_confidence: float | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(FeatureModel).filter(FeatureModel.project_id == project_id)
    if feature_class:
        q = q.filter(FeatureModel.feature_class == feature_class)
    if min_confidence is not None:
        q = q.filter(FeatureModel.confidence >= min_confidence)
    features = q.order_by(FeatureModel.created_at.desc()).all()
    return {
        "type": "FeatureCollection",
        "features": [_to_geojson_feature(f) for f in features],
    }


@router.post("/api/projects/{project_id}/features", status_code=201)
def create_feature(project_id: str, body: FeatureCreate, db: Session = Depends(get_db)):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    feature = FeatureModel(
        id=str(uuid.uuid4()),
        project_id=project_id,
        geometry=body.geometry,
        feature_class=body.feature_class,
        confidence=body.confidence,
        area_sq_m=body.area_sq_m,
        source=body.source,
        properties=body.properties,
    )
    db.add(feature)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(feature)
    return _to_geojson_feature(feature)


@router.post("/api/projects/{project_id}/features/import")
def import_features(project_id: str, body: FeatureImport, db: Session = Depends(get_db)):
    """Bulk import GeoJSON features into a project."""
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    count = 0
    for f in body.features:
        props = f.get("properties", {})
        feature = FeatureModel(
            id=props.get("id", str(uuid.uuid4())),
            project_id=project_id,
            geometry=f.get("geometry", {}),
            feature_class=props.get("class", "unknown"),
            confidence=props.get("confidence"),
            area_sq_m=props.get("area_sq_m"),
            source=props.get("source", "ai"),
            properties={k: v for k, v in props.items()
                        if k not in ("id", "class", "confidence", "area_sq_m", "source")},
        )
        db.add(feature)
        count += 1
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok", "imported": count}


# --- Individual feature ops ---

@router.get("/api/features/{feature_id}")
def get_feature(feature_id: str, db: Session = Depends(get_db)):
    f = db.query(FeatureModel).filter(FeatureModel.id == feature_id).first()
    if not f:
        raise HTTPException(404, "Feature not found")
    return _to_geojson_feature(f)


@router.patch("/api/features/{feature_id}")
def update_feature(feature_id: str, body: FeatureUpdate, db: Session = Depends(get_db)):
    f = db.query(FeatureModel).filter(FeatureModel.id == feature_id).first()
    if not f:
        raise HTTPException(404, "Feature not found")
    if body.feature_class is not None:
        f.feature_class = body.feature_class
    if body.confidence is not None:
        f.confidence = body.confidence
    if body.properties is not None:
        f.properties = {**(f.properties or {}), **body.properties}
    db.commit()
    return _to_geojson_feature(f)


@router.delete("/api/features/{feature_id}")
def delete_feature(feature_id: str, db: Session = Depends(get_db)):
    f = db.query(FeatureModel).filter(FeatureModel.id == feature_id).first()
    if not f:
        raise HTTPException(404, "Feature not found")
    db.delete(f)
    db.commit()
    return {"status": "ok"}


@router.post("/api/features/batch-delete")
def batch_delete_features(body: BatchDeleteRequest, db: Session = Depends(get_db)):
    count = db.query(FeatureModel).filter(FeatureModel.id.in_(body.ids)).delete(synchronize_session=False)
    db.commit()
    return {"status": "ok", "deleted": count}


@router.post("/api/features/batch-class")
def batch_update_class(body: BatchClassUpdate, db: Session = Depends(get_db)):
    count = db.query(FeatureModel).filter(FeatureModel.id.in_(body.ids)).update(
        {"feature_class": body.feature_class}, synchronize_session=False
    )
    db.commit()
    return {"status": "ok", "updated": count}

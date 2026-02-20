"""Phase 8: Change Detection — multi-temporal comparison endpoints."""

import uuid
import math
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import FeatureModel, ProjectModel

router = APIRouter(prefix="/api/change-detection", tags=["change-detection"])


class ChangeDetectionRequest(BaseModel):
    """Compare two sets of features (before/after)."""
    project_id: str
    before_image_id: str
    after_image_id: str
    classes: list[str] = ["building"]
    change_threshold: float = 0.5  # IoU threshold for matching


class ChangeFeature(BaseModel):
    id: str
    change_type: str  # "new" | "demolished" | "modified" | "unchanged"
    geometry: dict
    before_class: str | None = None
    after_class: str | None = None
    confidence: float
    area_sq_m: float


class ChangeDetectionResponse(BaseModel):
    task_id: str
    status: str
    changes: list[ChangeFeature]
    summary: dict  # { new: int, demolished: int, modified: int, unchanged: int }


def _iou_bbox(geom_a: dict, geom_b: dict) -> float:
    """Approximate IoU from bounding boxes of two GeoJSON geometries."""
    def _bbox(geom: dict) -> tuple[float, float, float, float]:
        coords = geom.get("coordinates", [[]])
        ring = coords[0] if geom["type"] == "Polygon" else coords[0][0]
        lngs = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        return (min(lngs), min(lats), max(lngs), max(lats))

    try:
        ax1, ay1, ax2, ay2 = _bbox(geom_a)
        bx1, by1, bx2, by2 = _bbox(geom_b)
    except (IndexError, TypeError, ValueError):
        return 0.0

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter

    return inter / union if union > 0 else 0.0


@router.post("", response_model=ChangeDetectionResponse)
async def detect_changes(body: ChangeDetectionRequest, db: Session = Depends(get_db)):
    """
    Compare features from two time periods.

    For now this uses stored features from the project. When connected to a
    real inference backend, it will run segmentation on both images and diff.
    """
    project = db.query(ProjectModel).filter(ProjectModel.id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Get features tagged with before/after image IDs
    before_features = (
        db.query(FeatureModel)
        .filter(
            FeatureModel.project_id == body.project_id,
            FeatureModel.properties.contains({"image_id": body.before_image_id}),
        )
        .all()
    )
    after_features = (
        db.query(FeatureModel)
        .filter(
            FeatureModel.project_id == body.project_id,
            FeatureModel.properties.contains({"image_id": body.after_image_id}),
        )
        .all()
    )

    # Match features by IoU
    matched_before: set[str] = set()
    matched_after: set[str] = set()
    changes: list[ChangeFeature] = []

    for af in after_features:
        best_iou = 0.0
        best_bf = None
        for bf in before_features:
            if bf.id in matched_before:
                continue
            iou = _iou_bbox(bf.geometry, af.geometry)
            if iou > best_iou:
                best_iou = iou
                best_bf = bf

        if best_bf and best_iou >= body.change_threshold:
            matched_before.add(best_bf.id)
            matched_after.add(af.id)
            change_type = "modified" if best_bf.feature_class != af.feature_class else "unchanged"
            changes.append(ChangeFeature(
                id=str(uuid.uuid4()),
                change_type=change_type,
                geometry=af.geometry,
                before_class=best_bf.feature_class,
                after_class=af.feature_class,
                confidence=min(best_bf.confidence or 0.5, af.confidence or 0.5),
                area_sq_m=af.area_sq_m or 0,
            ))
        else:
            # New feature (not matched to any before)
            matched_after.add(af.id)
            changes.append(ChangeFeature(
                id=str(uuid.uuid4()),
                change_type="new",
                geometry=af.geometry,
                before_class=None,
                after_class=af.feature_class,
                confidence=af.confidence or 0.5,
                area_sq_m=af.area_sq_m or 0,
            ))

    # Demolished: before features not matched
    for bf in before_features:
        if bf.id not in matched_before:
            changes.append(ChangeFeature(
                id=str(uuid.uuid4()),
                change_type="demolished",
                geometry=bf.geometry,
                before_class=bf.feature_class,
                after_class=None,
                confidence=bf.confidence or 0.5,
                area_sq_m=bf.area_sq_m or 0,
            ))

    summary = {
        "new": sum(1 for c in changes if c.change_type == "new"),
        "demolished": sum(1 for c in changes if c.change_type == "demolished"),
        "modified": sum(1 for c in changes if c.change_type == "modified"),
        "unchanged": sum(1 for c in changes if c.change_type == "unchanged"),
        "total": len(changes),
    }

    return ChangeDetectionResponse(
        task_id=str(uuid.uuid4()),
        status="completed",
        changes=changes,
        summary=summary,
    )

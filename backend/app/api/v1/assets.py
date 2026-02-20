"""Sprint 1 — Spatial Assets API routes."""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.functions import ST_GeomFromGeoJSON, ST_Intersects, ST_MakeEnvelope
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.assets import ImageryAsset, ROI
from app.models.tenancy import Project
from app.schemas.assets_v1 import (
    ImageryAssetCreateV1, ImageryAssetDetailV1, ImageryAssetListV1,
    ROICreateV1, ROIDetailV1, ROIListV1,
)

router = APIRouter(prefix="/api/v1/assets", tags=["assets-v1"])


# ── Imagery ───────────────────────────────────────────────────────────

@router.post("/imagery", response_model=ImageryAssetDetailV1, status_code=201)
def create_imagery_asset(body: ImageryAssetCreateV1, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    asset = ImageryAsset(
        org_id=project.org_id,
        project_id=body.project_id,
        asset_type=body.asset_type,
        source_type=body.source_type,
        uri=body.uri,
        bands=body.bands,
        crs=body.crs,
    )
    if body.footprint:
        from geoalchemy2.elements import WKTElement
        from shapely.geometry import shape
        geom = shape(body.footprint)
        asset.footprint = WKTElement(geom.wkt, srid=4326)

    db.add(asset)
    db.commit()
    db.refresh(asset)
    return ImageryAssetDetailV1.model_validate(asset)


@router.get("/imagery", response_model=ImageryAssetListV1)
def list_imagery_assets(
    project_id: uuid.UUID = Query(...),
    bbox: str | None = Query(None, description="min_lng,min_lat,max_lng,max_lat"),
    time_from: datetime | None = Query(None),
    time_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(ImageryAsset).filter(
        ImageryAsset.project_id == project_id,
        ImageryAsset.deleted_at.is_(None),
    )
    if bbox:
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) == 4:
            envelope = ST_MakeEnvelope(parts[0], parts[1], parts[2], parts[3], 4326)
            q = q.filter(ST_Intersects(ImageryAsset.footprint, envelope))
    if time_from:
        q = q.filter(ImageryAsset.acquired_at >= time_from)
    if time_to:
        q = q.filter(ImageryAsset.acquired_at <= time_to)

    assets = q.order_by(ImageryAsset.created_at.desc()).all()
    return ImageryAssetListV1(
        assets=[ImageryAssetDetailV1.model_validate(a) for a in assets],
    )


@router.get("/imagery/{asset_id}", response_model=ImageryAssetDetailV1)
def get_imagery_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    asset = db.query(ImageryAsset).filter(
        ImageryAsset.asset_id == asset_id,
        ImageryAsset.deleted_at.is_(None),
    ).first()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return ImageryAssetDetailV1.model_validate(asset)


# ── ROIs ──────────────────────────────────────────────────────────────

@router.post("/rois", response_model=ROIDetailV1, status_code=201)
def create_roi(body: ROICreateV1, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    from geoalchemy2.elements import WKTElement
    from shapely.geometry import shape
    geom = shape(body.geom)

    roi = ROI(
        org_id=project.org_id,
        project_id=body.project_id,
        name=body.name,
        geom=WKTElement(geom.wkt, srid=4326),
        source=body.source,
    )
    db.add(roi)
    db.commit()
    db.refresh(roi)
    return ROIDetailV1.model_validate(roi)


@router.get("/rois", response_model=ROIListV1)
def list_rois(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    rois = (
        db.query(ROI)
        .filter(ROI.project_id == project_id, ROI.deleted_at.is_(None))
        .order_by(ROI.created_at.desc())
        .all()
    )
    return ROIListV1(rois=[ROIDetailV1.model_validate(r) for r in rois])

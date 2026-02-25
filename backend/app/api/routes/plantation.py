"""Plantation CRUD endpoints."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.plantation import (
    PlantationModel, PlantationAsset,
    PlantationCreate, PlantationUpdate, PlantationResponse, PlantationDetailResponse,
    PlantationAssetCreate, PlantationAssetResponse,
)

router = APIRouter(prefix="/api/plantations", tags=["plantations"])


def _plantation_response(p: PlantationModel) -> PlantationResponse:
    return PlantationResponse(
        id=p.id, name=p.name, description=p.description,
        location=p.location, boundary=p.boundary,
        area_hectares=p.area_hectares, tree_count=p.tree_count,
        health_score=p.health_score, owner_id=p.owner_id,
        asset_count=len(p.assets),
        created_at=p.created_at, updated_at=p.updated_at,
    )


def _asset_response(a: PlantationAsset) -> PlantationAssetResponse:
    return PlantationAssetResponse(
        id=a.id, plantation_id=a.plantation_id,
        asset_type=a.asset_type, position=a.position,
        asset_metadata=a.asset_metadata, model_url=a.model_url,
        created_at=a.created_at,
    )


def _bbox_filter(query, bbox: str | None):
    """Filter plantations whose GeoJSON Point location falls within a bbox.

    bbox format: "west,south,east,north" (all floats).
    Filtering is done in Python since SQLite has no spatial index.
    """
    if not bbox:
        return query, None
    try:
        west, south, east, north = [float(v) for v in bbox.split(",")]
    except ValueError:
        raise HTTPException(400, "bbox must be 'west,south,east,north' floats")
    return query, (west, south, east, north)


def _in_bbox(p: PlantationModel, bbox) -> bool:
    if bbox is None:
        return True
    west, south, east, north = bbox
    loc = p.location
    if not loc:
        return False
    # GeoJSON Point: {"type": "Point", "coordinates": [lon, lat]}
    coords = loc.get("coordinates")
    if not coords or len(coords) < 2:
        return False
    lon, lat = coords[0], coords[1]
    return west <= lon <= east and south <= lat <= north


# ── List ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PlantationResponse])
def list_plantations(
    bbox: str | None = Query(None, description="west,south,east,north"),
    db: Session = Depends(get_db),
):
    q = db.query(PlantationModel).order_by(PlantationModel.updated_at.desc())
    rows, bbox_tuple = _bbox_filter(q, bbox)
    results = [_plantation_response(p) for p in rows.all() if _in_bbox(p, bbox_tuple)]
    return results


# ── Detail ───────────────────────────────────────────────────────────────────

@router.get("/{plantation_id}", response_model=PlantationDetailResponse)
def get_plantation(plantation_id: str, db: Session = Depends(get_db)):
    p = db.query(PlantationModel).filter(PlantationModel.id == plantation_id).first()
    if not p:
        raise HTTPException(404, "Plantation not found")
    return PlantationDetailResponse(
        id=p.id, name=p.name, description=p.description,
        location=p.location, boundary=p.boundary,
        area_hectares=p.area_hectares, tree_count=p.tree_count,
        health_score=p.health_score, owner_id=p.owner_id,
        asset_count=len(p.assets),
        created_at=p.created_at, updated_at=p.updated_at,
        assets=[_asset_response(a) for a in p.assets],
    )


# ── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=PlantationResponse, status_code=201)
def create_plantation(body: PlantationCreate, db: Session = Depends(get_db)):
    p = PlantationModel(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        location=body.location,
        boundary=body.boundary,
        area_hectares=body.area_hectares,
        tree_count=body.tree_count,
        health_score=body.health_score,
        owner_id=body.owner_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _plantation_response(p)


# ── Update ───────────────────────────────────────────────────────────────────

@router.put("/{plantation_id}", response_model=PlantationResponse)
def update_plantation(plantation_id: str, body: PlantationUpdate, db: Session = Depends(get_db)):
    p = db.query(PlantationModel).filter(PlantationModel.id == plantation_id).first()
    if not p:
        raise HTTPException(404, "Plantation not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _plantation_response(p)


# ── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{plantation_id}")
def delete_plantation(plantation_id: str, db: Session = Depends(get_db)):
    p = db.query(PlantationModel).filter(PlantationModel.id == plantation_id).first()
    if not p:
        raise HTTPException(404, "Plantation not found")
    db.delete(p)
    db.commit()
    return {"status": "ok", "message": f"Plantation {plantation_id} deleted"}


# ── Assets ───────────────────────────────────────────────────────────────────

@router.get("/{plantation_id}/assets", response_model=list[PlantationAssetResponse])
def list_assets(plantation_id: str, db: Session = Depends(get_db)):
    p = db.query(PlantationModel).filter(PlantationModel.id == plantation_id).first()
    if not p:
        raise HTTPException(404, "Plantation not found")
    return [_asset_response(a) for a in p.assets]


@router.post("/{plantation_id}/assets", response_model=PlantationAssetResponse, status_code=201)
def add_asset(plantation_id: str, body: PlantationAssetCreate, db: Session = Depends(get_db)):
    p = db.query(PlantationModel).filter(PlantationModel.id == plantation_id).first()
    if not p:
        raise HTTPException(404, "Plantation not found")
    asset = PlantationAsset(
        id=str(uuid.uuid4()),
        plantation_id=plantation_id,
        asset_type=body.asset_type,
        position=body.position,
        asset_metadata=body.asset_metadata,
        model_url=body.model_url,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _asset_response(asset)

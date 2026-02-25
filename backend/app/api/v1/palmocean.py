"""PalmOcean API — Plantations, Trees, Health Snapshots, IoT Events."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.palmocean_db import get_palmocean_db, engine
from app.models.palmocean import Plantation, TreeAsset, TreeHealthSnapshot, IoTEvent

router = APIRouter()


# ── Pydantic Schemas ─────────────────────────────────────────────────────────


class PlantationCreate(BaseModel):
    name: str
    slug: str | None = None
    org_id: uuid.UUID | None = None
    region: str | None = None
    area_ha: float | None = None
    status: str = "active"


class PlantationResponse(BaseModel):
    plantation_id: uuid.UUID
    org_id: uuid.UUID
    name: str
    slug: str
    region: str | None
    area_ha: float | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TreeCreate(BaseModel):
    plantation_id: uuid.UUID
    external_id: str | None = None
    source_job_id: uuid.UUID | None = None
    lon: float
    lat: float
    height_m: float | None = None
    crown_radius_m: float | None = None
    age_years: int | None = None
    variety: str | None = None
    status: str = "active"


class TreeBulkCreate(BaseModel):
    trees: list[TreeCreate]


class TreeResponse(BaseModel):
    tree_id: uuid.UUID
    plantation_id: uuid.UUID
    external_id: str | None
    source_job_id: uuid.UUID | None
    lon: float
    lat: float
    height_m: float | None
    crown_radius_m: float | None
    age_years: int | None
    variety: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HealthSnapshotCreate(BaseModel):
    tree_id: uuid.UUID
    plantation_id: uuid.UUID
    timestamp: datetime | None = None
    health_score: float = Field(ge=0.0, le=1.0)
    ndvi: float | None = None
    canopy_coverage: float | None = None
    disease_flags: dict | None = None
    source: str  # "satellite", "drone", "sensor", "manual"
    job_id: uuid.UUID | None = None
    metadata: dict | None = None


class HealthSnapshotResponse(BaseModel):
    snapshot_id: uuid.UUID
    tree_id: uuid.UUID
    plantation_id: uuid.UUID
    timestamp: datetime
    health_score: float
    ndvi: float | None
    canopy_coverage: float | None
    disease_flags: dict | None
    source: str
    job_id: uuid.UUID | None
    metadata: dict | None

    model_config = {"from_attributes": True}


class IoTEventCreate(BaseModel):
    plantation_id: uuid.UUID
    tree_id: uuid.UUID | None = None
    device_id: str
    event_type: str  # "temperature", "humidity", "soil_moisture", "harvest"
    timestamp: datetime | None = None
    value: float
    unit: str
    raw_payload: dict | None = None


class IoTEventBulkCreate(BaseModel):
    events: list[IoTEventCreate] | None = None

    # Allow raw list for backward compatibility
    def __init__(self, **data):
        if "events" not in data and isinstance(data, list):
            data = {"events": data}
        super().__init__(**data)


class IoTEventResponse(BaseModel):
    event_id: uuid.UUID
    plantation_id: uuid.UUID
    tree_id: uuid.UUID | None
    device_id: str
    event_type: str
    timestamp: datetime
    value: float
    unit: str
    raw_payload: dict | None

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:100]


def _tree_to_response(tree: TreeAsset) -> TreeResponse:
    """Convert TreeAsset to response, extracting lon/lat from geometry."""
    from geoalchemy2.shape import to_shape

    point = to_shape(tree.geometry)
    return TreeResponse(
        tree_id=tree.tree_id,
        plantation_id=tree.plantation_id,
        external_id=tree.external_id,
        source_job_id=tree.source_job_id,
        lon=point.x,
        lat=point.y,
        height_m=tree.height_m,
        crown_radius_m=tree.crown_radius_m,
        age_years=tree.age_years,
        variety=tree.variety,
        status=tree.status,
        created_at=tree.created_at,
        updated_at=tree.updated_at,
    )


def _health_to_response(snapshot: TreeHealthSnapshot) -> HealthSnapshotResponse:
    return HealthSnapshotResponse(
        snapshot_id=snapshot.snapshot_id,
        tree_id=snapshot.tree_id,
        plantation_id=snapshot.plantation_id,
        timestamp=snapshot.timestamp,
        health_score=snapshot.health_score,
        ndvi=snapshot.ndvi,
        canopy_coverage=snapshot.canopy_coverage,
        disease_flags=snapshot.disease_flags,
        source=snapshot.source,
        job_id=snapshot.job_id,
        metadata=snapshot.metadata_,
    )


# ── Health Check ─────────────────────────────────────────────────────────────


@router.get("/health")
def palmocean_health(db: Session = Depends(get_palmocean_db)):
    """Check PalmOcean TimescaleDB connection and status."""
    try:
        result = db.execute(text("SELECT 1"))
        result.fetchone()

        # Check if TimescaleDB extension is enabled
        ts_result = db.execute(
            text("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')")
        )
        timescaledb_enabled = ts_result.scalar()

        return {"status": "ok", "timescaledb": timescaledb_enabled}
    except Exception as e:
        return {"status": "error", "timescaledb": False, "error": str(e)}


# ── Plantations ──────────────────────────────────────────────────────────────


@router.post("/plantations", response_model=PlantationResponse, status_code=201)
def create_plantation(body: PlantationCreate, db: Session = Depends(get_palmocean_db)):
    """Create a new plantation."""
    slug = body.slug or _slugify(body.name)

    # Check for duplicate slug
    existing = db.query(Plantation).filter(Plantation.slug == slug).first()
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    org_id = body.org_id or uuid.uuid4()  # Default org_id if not provided

    plantation = Plantation(
        org_id=org_id,
        name=body.name,
        slug=slug,
        region=body.region,
        area_ha=body.area_ha,
        status=body.status,
    )
    db.add(plantation)
    db.commit()
    db.refresh(plantation)
    return PlantationResponse.model_validate(plantation)


@router.get("/plantations", response_model=list[PlantationResponse])
def list_plantations(
    org_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_palmocean_db),
):
    """List plantations, optionally filtered by org_id or status."""
    query = db.query(Plantation)
    if org_id:
        query = query.filter(Plantation.org_id == org_id)
    if status:
        query = query.filter(Plantation.status == status)
    plantations = query.order_by(Plantation.updated_at.desc()).all()
    return [PlantationResponse.model_validate(p) for p in plantations]


@router.get("/plantations/{plantation_id}", response_model=PlantationResponse)
def get_plantation(plantation_id: uuid.UUID, db: Session = Depends(get_palmocean_db)):
    """Get a plantation by ID."""
    plantation = db.query(Plantation).filter(Plantation.plantation_id == plantation_id).first()
    if not plantation:
        raise HTTPException(404, "Plantation not found")
    return PlantationResponse.model_validate(plantation)


# ── Trees ────────────────────────────────────────────────────────────────────


@router.post("/trees", status_code=201)
def bulk_upsert_trees(body: TreeBulkCreate, db: Session = Depends(get_palmocean_db)):
    """Bulk upsert trees from inference results."""
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    created = 0
    updated = 0

    for tree_data in body.trees:
        # Check if tree exists by external_id within plantation
        existing = None
        if tree_data.external_id:
            existing = (
                db.query(TreeAsset)
                .filter(
                    TreeAsset.plantation_id == tree_data.plantation_id,
                    TreeAsset.external_id == tree_data.external_id,
                )
                .first()
            )

        geometry = from_shape(Point(tree_data.lon, tree_data.lat), srid=4326)

        if existing:
            # Update existing tree
            existing.geometry = geometry
            existing.height_m = tree_data.height_m
            existing.crown_radius_m = tree_data.crown_radius_m
            existing.age_years = tree_data.age_years
            existing.variety = tree_data.variety
            existing.status = tree_data.status
            existing.source_job_id = tree_data.source_job_id
            existing.updated_at = datetime.now(timezone.utc)
            updated += 1
        else:
            # Create new tree
            tree = TreeAsset(
                plantation_id=tree_data.plantation_id,
                external_id=tree_data.external_id,
                source_job_id=tree_data.source_job_id,
                geometry=geometry,
                height_m=tree_data.height_m,
                crown_radius_m=tree_data.crown_radius_m,
                age_years=tree_data.age_years,
                variety=tree_data.variety,
                status=tree_data.status,
            )
            db.add(tree)
            created += 1

    db.commit()
    return {"status": "ok", "created": created, "updated": updated}


@router.get("/trees", response_model=list[TreeResponse])
def list_trees(
    plantation_id: uuid.UUID = Query(...),
    status: str | None = Query(None),
    limit: int = Query(1000, le=10000),
    offset: int = Query(0),
    db: Session = Depends(get_palmocean_db),
):
    """List trees for a plantation."""
    query = db.query(TreeAsset).filter(TreeAsset.plantation_id == plantation_id)
    if status:
        query = query.filter(TreeAsset.status == status)
    trees = query.order_by(TreeAsset.created_at.desc()).offset(offset).limit(limit).all()
    return [_tree_to_response(t) for t in trees]


# ── Health Snapshots ─────────────────────────────────────────────────────────


@router.post("/health", response_model=HealthSnapshotResponse, status_code=201)
def ingest_health_snapshot(body: HealthSnapshotCreate, db: Session = Depends(get_palmocean_db)):
    """Ingest a health snapshot for a tree."""
    timestamp = body.timestamp or datetime.now(timezone.utc)

    snapshot = TreeHealthSnapshot(
        tree_id=body.tree_id,
        plantation_id=body.plantation_id,
        timestamp=timestamp,
        health_score=body.health_score,
        ndvi=body.ndvi,
        canopy_coverage=body.canopy_coverage,
        disease_flags=body.disease_flags,
        source=body.source,
        job_id=body.job_id,
        metadata_=body.metadata,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return _health_to_response(snapshot)


@router.get("/health/{tree_id}", response_model=list[HealthSnapshotResponse])
def get_health_history(
    tree_id: uuid.UUID,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_palmocean_db),
):
    """Get health history for a tree."""
    query = db.query(TreeHealthSnapshot).filter(TreeHealthSnapshot.tree_id == tree_id)
    if from_:
        query = query.filter(TreeHealthSnapshot.timestamp >= from_)
    if to:
        query = query.filter(TreeHealthSnapshot.timestamp <= to)
    snapshots = query.order_by(TreeHealthSnapshot.timestamp.desc()).limit(limit).all()
    return [_health_to_response(s) for s in snapshots]


@router.get("/health/{tree_id}/latest", response_model=HealthSnapshotResponse)
def get_latest_health(tree_id: uuid.UUID, db: Session = Depends(get_palmocean_db)):
    """Get the latest health snapshot for a tree."""
    snapshot = (
        db.query(TreeHealthSnapshot)
        .filter(TreeHealthSnapshot.tree_id == tree_id)
        .order_by(TreeHealthSnapshot.timestamp.desc())
        .first()
    )
    if not snapshot:
        raise HTTPException(404, "No health snapshots found for this tree")
    return _health_to_response(snapshot)


# ── IoT Events ───────────────────────────────────────────────────────────────


@router.post("/iot/events", status_code=201)
def ingest_iot_events(body: list[IoTEventCreate], db: Session = Depends(get_palmocean_db)):
    """Bulk ingest IoT events."""
    created = 0
    for event_data in body:
        timestamp = event_data.timestamp or datetime.now(timezone.utc)
        event = IoTEvent(
            plantation_id=event_data.plantation_id,
            tree_id=event_data.tree_id,
            device_id=event_data.device_id,
            event_type=event_data.event_type,
            timestamp=timestamp,
            value=event_data.value,
            unit=event_data.unit,
            raw_payload=event_data.raw_payload,
        )
        db.add(event)
        created += 1

    db.commit()
    return {"status": "ok", "created": created}


@router.get("/iot/events", response_model=list[IoTEventResponse])
def query_iot_events(
    plantation_id: uuid.UUID | None = Query(None),
    device_id: str | None = Query(None),
    event_type: str | None = Query(None),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    limit: int = Query(1000, le=10000),
    db: Session = Depends(get_palmocean_db),
):
    """Query IoT events with optional filters."""
    query = db.query(IoTEvent)
    if plantation_id:
        query = query.filter(IoTEvent.plantation_id == plantation_id)
    if device_id:
        query = query.filter(IoTEvent.device_id == device_id)
    if event_type:
        query = query.filter(IoTEvent.event_type == event_type)
    if from_:
        query = query.filter(IoTEvent.timestamp >= from_)
    if to:
        query = query.filter(IoTEvent.timestamp <= to)

    events = query.order_by(IoTEvent.timestamp.desc()).limit(limit).all()
    return [IoTEventResponse.model_validate(e) for e in events]

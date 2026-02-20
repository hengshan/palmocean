"""Sprint 1 — Map Config API routes."""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.kepler import MapConfig, MapConfigRelease, MapConfigShare
from app.models.tenancy import Project
from app.schemas.map_configs_v1 import (
    MapConfigCreateV1, MapConfigCreated, MapConfigDetail,
    MapConfigListResponse, ReleaseRequest, ShareRequest, ShareResponse,
)

router = APIRouter(prefix="/api/v1/map-configs", tags=["map-configs-v1"])


# Dummy user/org id for now (no auth wired yet)
_DUMMY_USER = uuid.UUID("00000000-0000-0000-0000-000000000001")


@router.post("", response_model=MapConfigCreated, status_code=201)
def create_map_config(body: MapConfigCreateV1, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Compute next version
    max_ver = (
        db.query(func.max(MapConfig.version))
        .filter(MapConfig.project_id == body.project_id)
        .scalar()
    ) or 0

    mc = MapConfig(
        org_id=project.org_id,
        project_id=body.project_id,
        parent_id=body.parent_id,
        version=max_ver + 1,
        title=body.title,
        kepler_config=body.kepler_config,
        dataset_refs=body.dataset_refs,
        created_by=_DUMMY_USER,
    )
    db.add(mc)
    db.commit()
    db.refresh(mc)
    return MapConfigCreated(map_config_id=mc.map_config_id, version=mc.version)


@router.get("/{map_config_id}", response_model=MapConfigDetail)
def get_map_config(map_config_id: uuid.UUID, db: Session = Depends(get_db)):
    mc = db.query(MapConfig).filter(MapConfig.map_config_id == map_config_id).first()
    if not mc:
        raise HTTPException(404, "Map config not found")
    return MapConfigDetail.model_validate(mc)


@router.get("", response_model=MapConfigListResponse)
def list_map_configs(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    configs = (
        db.query(MapConfig)
        .filter(MapConfig.project_id == project_id)
        .order_by(MapConfig.version.desc())
        .all()
    )
    return MapConfigListResponse(
        configs=[MapConfigDetail.model_validate(c) for c in configs],
    )


@router.post("/{map_config_id}/release", status_code=201)
def release_map_config(
    map_config_id: uuid.UUID,
    body: ReleaseRequest,
    db: Session = Depends(get_db),
):
    mc = db.query(MapConfig).filter(MapConfig.map_config_id == map_config_id).first()
    if not mc:
        raise HTTPException(404, "Map config not found")

    release = MapConfigRelease(
        org_id=mc.org_id,
        map_config_id=map_config_id,
        channel=body.channel,
        released_by=_DUMMY_USER,
    )
    db.add(release)
    db.commit()
    db.refresh(release)
    return {"release_id": str(release.release_id), "channel": release.channel}


@router.post("/{map_config_id}/share", response_model=ShareResponse, status_code=201)
def share_map_config(
    map_config_id: uuid.UUID,
    body: ShareRequest,
    db: Session = Depends(get_db),
):
    mc = db.query(MapConfig).filter(MapConfig.map_config_id == map_config_id).first()
    if not mc:
        raise HTTPException(404, "Map config not found")

    token = secrets.token_urlsafe(32)
    share = MapConfigShare(
        org_id=mc.org_id,
        map_config_id=map_config_id,
        visibility=body.visibility,
        token=token,
        expires_at=body.expires_at,
        created_by=_DUMMY_USER,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    url = f"/shared/maps/{token}"
    return ShareResponse(share_id=share.share_id, token=token, url=url)

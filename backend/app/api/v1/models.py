"""Sprint 1 — Models API routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ml import Model, ModelVersion
from app.schemas.models_v1 import ModelItem, ModelList, ModelVersionItem, ModelVersionList

router = APIRouter(prefix="/api/v1/models", tags=["models-v1"])


@router.get("", response_model=ModelList)
def list_models(
    task_type: str | None = Query(None),
    org_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Model).filter(Model.archived_at.is_(None))
    if task_type:
        q = q.filter(Model.task_type == task_type)
    if org_id:
        q = q.filter(Model.org_id == org_id)
    models = q.order_by(Model.name).all()

    items = []
    for m in models:
        versions = [
            ModelVersionItem(
                version_id=v.model_version_id,
                version=v.version,
                status=v.status,
                metrics=v.metrics,
                input_spec=v.input_spec,
                output_spec=v.output_spec,
                created_at=v.created_at,
            )
            for v in m.versions
        ]
        items.append(ModelItem(
            model_id=m.model_id,
            name=m.name,
            task_type=m.task_type,
            description=m.description,
            versions=versions,
        ))
    return ModelList(models=items)


@router.get("/{model_id}/versions", response_model=ModelVersionList)
def list_model_versions(model_id: uuid.UUID, db: Session = Depends(get_db)):
    model = db.query(Model).filter(Model.model_id == model_id).first()
    if not model:
        raise HTTPException(404, "Model not found")
    versions = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id)
        .order_by(ModelVersion.created_at.desc())
        .all()
    )
    return ModelVersionList(
        versions=[
            ModelVersionItem(
                version_id=v.model_version_id,
                version=v.version,
                status=v.status,
                metrics=v.metrics,
                input_spec=v.input_spec,
                output_spec=v.output_spec,
                created_at=v.created_at,
            )
            for v in versions
        ]
    )

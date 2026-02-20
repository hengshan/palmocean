"""Sprint 1 — Inference API routes."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db, DATABASE_URL
from app.models.ml import InferenceJob, InferenceOutput, ModelVersion, Model
from app.models.tenancy import Project
from app.schemas.inference_v1 import (
    InferenceJobSubmit, InferenceJobQueued, InferenceJobDetail,
    InferenceJobList, InferenceOutputItem, InferenceOutputList,
)
from app.services.inference_service import run_inference_background, subscribe, unsubscribe

router = APIRouter(prefix="/api/v1/inference", tags=["inference-v1"])


@router.post("/jobs", response_model=InferenceJobQueued, status_code=201)
async def submit_job(body: InferenceJobSubmit, db: Session = Depends(get_db)):
    """Submit an inference job."""
    # Validate project
    project = db.query(Project).filter(Project.project_id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Resolve model version
    model_version_id = body.model_version_id
    if not model_version_id:
        # Pick latest version of a model matching task_type
        model = db.query(Model).filter(Model.task_type == body.task_type).first()
        if not model:
            raise HTTPException(400, f"No model found for task_type={body.task_type}")
        version = (
            db.query(ModelVersion)
            .filter(ModelVersion.model_id == model.model_id, ModelVersion.status == "published")
            .order_by(ModelVersion.created_at.desc())
            .first()
        )
        if not version:
            # fallback to any version
            version = (
                db.query(ModelVersion)
                .filter(ModelVersion.model_id == model.model_id)
                .order_by(ModelVersion.created_at.desc())
                .first()
            )
        if not version:
            raise HTTPException(400, "No model version available")
        model_version_id = version.model_version_id

    job = InferenceJob(
        org_id=project.org_id,
        project_id=body.project_id,
        model_version_id=model_version_id,
        status="queued",
        params=body.params or {},
        input_snapshot={"aoi": body.aoi, "task_type": body.task_type},
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Fire background task
    asyncio.get_event_loop().create_task(
        run_inference_background(
            job_id=job.job_id,
            db_url=DATABASE_URL,
            model_version_id=model_version_id,
            aoi=body.aoi,
            params=body.params,
        )
    )

    return InferenceJobQueued(job_id=job.job_id, status="queued")


@router.get("/jobs", response_model=InferenceJobList)
def list_jobs(
    project_id: uuid.UUID = Query(...),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(InferenceJob).filter(InferenceJob.project_id == project_id)
    if status:
        q = q.filter(InferenceJob.status == status)
    total = q.count()
    jobs = q.order_by(InferenceJob.created_at.desc()).offset(offset).limit(limit).all()
    return InferenceJobList(
        jobs=[InferenceJobDetail.model_validate(j) for j in jobs],
        total=total,
    )


@router.get("/jobs/{job_id}", response_model=InferenceJobDetail)
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return InferenceJobDetail.model_validate(job)


@router.get("/jobs/{job_id}/outputs", response_model=InferenceOutputList)
def get_job_outputs(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    outputs = db.query(InferenceOutput).filter(InferenceOutput.job_id == job_id).all()
    return InferenceOutputList(
        outputs=[InferenceOutputItem.model_validate(o) for o in outputs],
    )


@router.websocket("/jobs/{job_id}/stream")
async def job_stream(websocket: WebSocket, job_id: uuid.UUID):
    await websocket.accept()
    q = subscribe(job_id)
    try:
        while True:
            msg = await q.get()
            await websocket.send_json(msg)
            if msg.get("type") in ("complete", "error"):
                break
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe(job_id, q)

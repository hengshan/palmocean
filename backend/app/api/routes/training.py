"""Phase 8: Custom model training — few-shot fine-tuning management."""

import uuid
from datetime import datetime, timezone
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings

router = APIRouter(prefix="/api/training", tags=["training"])


class TrainingStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TrainingJobCreate(BaseModel):
    """Create a fine-tuning job from annotated project features."""
    project_id: str
    model_base: str = "prithvi-eo-2.0-300m"  # base model to fine-tune
    classes: list[str] = ["building"]
    epochs: int = 20
    batch_size: int = 4
    learning_rate: float = 1e-4
    use_lora: bool = True  # LoRA for efficient fine-tuning
    lora_rank: int = 16
    notes: str | None = None


class TrainingJobResponse(BaseModel):
    job_id: str
    status: TrainingStatus
    project_id: str
    model_base: str
    classes: list[str]
    config: dict
    created_at: str
    metrics: dict | None = None
    checkpoint_path: str | None = None


# In-memory job store (will be DB-backed in production)
_jobs: dict[str, dict] = {}


@router.post("/jobs", response_model=TrainingJobResponse, status_code=201)
async def create_training_job(body: TrainingJobCreate):
    """
    Submit a fine-tuning job. In production, this dispatches to the GPU
    inference server (Lyra's RTX 5090) via the inference API.
    """
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    job = {
        "job_id": job_id,
        "status": TrainingStatus.PENDING,
        "project_id": body.project_id,
        "model_base": body.model_base,
        "classes": body.classes,
        "config": {
            "epochs": body.epochs,
            "batch_size": body.batch_size,
            "learning_rate": body.learning_rate,
            "use_lora": body.use_lora,
            "lora_rank": body.lora_rank,
        },
        "created_at": now,
        "metrics": None,
        "checkpoint_path": None,
        "notes": body.notes,
    }

    # TODO: In production, dispatch to inference API:
    # POST {INFERENCE_API_URL}/training/start with project features + config
    # The GPU server handles actual training and reports back via webhook or polling

    _jobs[job_id] = job
    return TrainingJobResponse(**job)


@router.get("/jobs", response_model=list[TrainingJobResponse])
async def list_training_jobs():
    return [TrainingJobResponse(**j) for j in _jobs.values()]


@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
async def get_training_job(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(404, "Training job not found")
    return TrainingJobResponse(**_jobs[job_id])


@router.delete("/jobs/{job_id}")
async def cancel_training_job(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(404, "Training job not found")
    job = _jobs[job_id]
    if job["status"] == TrainingStatus.RUNNING:
        # TODO: Send cancel signal to inference API
        job["status"] = TrainingStatus.FAILED
    del _jobs[job_id]
    return {"status": "ok", "message": f"Job {job_id} cancelled"}


@router.get("/models")
async def list_available_models():
    """List base models available for fine-tuning."""
    return {
        "models": [
            {
                "id": "prithvi-eo-2.0-300m",
                "name": "Prithvi-EO 2.0 (300M)",
                "provider": "IBM/NASA",
                "params": "300M",
                "supports_lora": True,
                "default": True,
            },
            {
                "id": "sam2-large",
                "name": "SAM 2 Large",
                "provider": "Meta",
                "params": "312M",
                "supports_lora": False,
                "default": False,
            },
        ]
    }

"""Seed3D 3D generation API endpoints."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.seed3d_service import seed3d_service

router = APIRouter(prefix="/api/seed3d", tags=["seed3d"])


# --- Pydantic Schemas ---

class GenerateRequest(BaseModel):
    prompt: str
    reference_images: list[str] | None = None
    output_format: Literal["gltf", "usd"] = "gltf"


class GenerateResponse(BaseModel):
    task_id: str
    status: str = "pending"


class TaskStatusResponse(BaseModel):
    task_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    result_url: str | None = None
    progress: int | None = None


class AssetResponse(BaseModel):
    id: str
    task_id: str
    prompt: str
    output_format: str
    result_url: str
    created_at: float


# --- Routes ---

@router.post("/generate", response_model=GenerateResponse, status_code=202)
def generate_3d(body: GenerateRequest):
    """Submit a 3D generation task.

    Returns a task_id immediately. Poll /api/seed3d/status/{task_id} for updates.
    """
    task_id = seed3d_service.generate_3d(
        prompt=body.prompt,
        references=body.reference_images,
        output_format=body.output_format,
    )
    return GenerateResponse(task_id=task_id, status="pending")


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str):
    """Query the status of a 3D generation task."""
    task = seed3d_service.get_task_status(task_id)
    if task is None:
        raise HTTPException(404, f"Task {task_id} not found")
    return TaskStatusResponse(
        task_id=task["task_id"],
        status=task["status"],
        result_url=task.get("result_url"),
        progress=task.get("progress"),
    )


@router.get("/assets", response_model=list[AssetResponse])
def list_assets():
    """List all successfully generated 3D assets."""
    return seed3d_service.list_assets()


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str):
    """Delete a generated 3D asset."""
    deleted = seed3d_service.delete_asset(asset_id)
    if not deleted:
        raise HTTPException(404, f"Asset {asset_id} not found")
    return {"status": "ok", "message": f"Asset {asset_id} deleted"}

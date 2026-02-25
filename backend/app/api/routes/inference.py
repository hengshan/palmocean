import logging

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from app.schemas.inference import (
    PointPrompt, BoxPrompt, AutoPrompt, SemanticPrompt, TextPrompt, InferenceResponse,
    PersistRequest, PersistResponse, SavedResultResponse, SavedResultListResponse, SavedResultListItem,
)
from app.tasks.inference import run_point_inference, run_box_inference, run_auto_inference, run_semantic_inference, run_text_inference
from app.services.inference.sam_service import sam_service
from app.services.inference.persist_service import persist_result, get_result, list_results

logger = logging.getLogger(__name__)

router = APIRouter()


def _handle_inference_error(exc: Exception, context: str) -> None:
    """Map known exceptions to proper HTTP errors with logging."""
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, ValidationError):
        logger.warning("Validation error in %s: %s", context, exc)
        raise HTTPException(status_code=422, detail=f"Invalid input: {exc}")
    if isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, ConnectionError, OSError)):
        logger.error("ML service unreachable during %s: %s", context, exc)
        raise HTTPException(
            status_code=503,
            detail="The inference service is currently unavailable. Please try again later.",
        )
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        logger.error("Timeout during %s: %s", context, exc)
        raise HTTPException(
            status_code=504,
            detail="Inference request timed out. Try a smaller region or simpler prompt.",
        )
    if isinstance(exc, ValueError):
        logger.warning("Invalid input in %s: %s", context, exc)
        raise HTTPException(status_code=422, detail=str(exc))
    # Unexpected
    logger.exception("Unexpected error in %s", context)
    raise HTTPException(
        status_code=500,
        detail="An unexpected error occurred during inference. Please try again.",
    )


@router.get("/health")
async def inference_health():
    """Check inference backend connectivity."""
    try:
        return await sam_service.health_check()
    except Exception as exc:
        logger.error("Inference health check failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Inference service is not reachable.",
        )


@router.post("/point", response_model=InferenceResponse)
async def infer_point(prompt: PointPrompt):
    try:
        return await run_point_inference(
            prompt.image_id, prompt.point.lng, prompt.point.lat, prompt.label
        )
    except Exception as exc:
        _handle_inference_error(exc, "point inference")


@router.post("/box", response_model=InferenceResponse)
async def infer_box(prompt: BoxPrompt):
    try:
        return await run_box_inference(
            prompt.image_id,
            prompt.bbox.min_lng,
            prompt.bbox.min_lat,
            prompt.bbox.max_lng,
            prompt.bbox.max_lat,
        )
    except Exception as exc:
        _handle_inference_error(exc, "box inference")


@router.post("/auto", response_model=InferenceResponse)
async def infer_auto(prompt: AutoPrompt):
    try:
        bbox = None
        if prompt.bbox:
            bbox = (prompt.bbox.min_lng, prompt.bbox.min_lat, prompt.bbox.max_lng, prompt.bbox.max_lat)
        return await run_auto_inference(prompt.image_id, bbox)
    except Exception as exc:
        _handle_inference_error(exc, "auto inference")


@router.post("/semantic", response_model=InferenceResponse)
async def infer_semantic(prompt: SemanticPrompt):
    try:
        bbox = None
        if prompt.bbox:
            bbox = (prompt.bbox.min_lng, prompt.bbox.min_lat, prompt.bbox.max_lng, prompt.bbox.max_lat)
        return await run_semantic_inference(prompt.image_id, prompt.classes, bbox)
    except Exception as exc:
        _handle_inference_error(exc, "semantic inference")


@router.post("/text")
async def infer_text(prompt: TextPrompt):
    """Text-guided segmentation — parse natural language prompt and segment."""
    try:
        bbox = None
        if prompt.bbox:
            bbox = (prompt.bbox.min_lng, prompt.bbox.min_lat, prompt.bbox.max_lng, prompt.bbox.max_lat)
        return await run_text_inference(prompt.image_id, prompt.prompt, bbox)
    except Exception as exc:
        _handle_inference_error(exc, "text inference")


# ── Persist endpoints ─────────────────────────────────────────────────

@router.post("/persist", response_model=PersistResponse, status_code=201)
async def persist_inference_result(body: PersistRequest):
    """Persist a completed inference result to PalmOcean DB (Phase 1: inline storage)."""
    try:
        draft = persist_result(
            model_slug=body.model_slug,
            task_type=body.task_type,
            prompt_type=body.prompt_type,
            geojson=body.geojson,
            stats=body.stats,
            prompt_params=body.prompt_params,
            plantation_id=body.plantation_id,
            project_id=body.project_id,
            inference_time_ms=body.inference_time_ms,
            image_url=body.image_url,
        )
        return PersistResponse(
            id=draft.id,
            created_at=draft.created_at,
            permalink=f"/api/inference/results/{draft.id}",
        )
    except Exception as exc:
        logger.exception("Failed to persist inference result: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to persist inference result.")


@router.get("/results/{result_id}", response_model=SavedResultResponse)
async def get_saved_result(result_id: str):
    """Fetch a single saved inference result by ID."""
    try:
        draft = get_result(result_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid result ID format.")
    if draft is None:
        raise HTTPException(status_code=404, detail="Inference result not found.")
    return SavedResultResponse(
        id=draft.id,
        plantation_id=draft.plantation_id,
        project_id=draft.project_id,
        model_slug=draft.model_slug,
        task_type=draft.task_type,
        prompt_type=draft.prompt_type,
        prompt_params=draft.prompt_params,
        geojson=draft.geojson,
        stats=draft.stats,
        inference_time_ms=draft.inference_time_ms,
        image_url=draft.image_url,
        created_at=draft.created_at,
    )


@router.get("/results", response_model=SavedResultListResponse)
async def list_saved_results(
    project_id: str | None = Query(None),
    plantation_id: str | None = Query(None),
    model_slug: str | None = Query(None),
    task_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List saved inference results with optional filters."""
    total, items = list_results(
        project_id=project_id,
        plantation_id=plantation_id,
        model_slug=model_slug,
        task_type=task_type,
        page=page,
        page_size=page_size,
    )
    return SavedResultListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[
            SavedResultListItem(
                id=d.id,
                plantation_id=d.plantation_id,
                model_slug=d.model_slug,
                task_type=d.task_type,
                stats=d.stats,
                created_at=d.created_at,
            )
            for d in items
        ],
    )

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.schemas.inference import PointPrompt, BoxPrompt, AutoPrompt, SemanticPrompt, TextPrompt, InferenceResponse
from app.tasks.inference import run_point_inference, run_box_inference, run_auto_inference, run_semantic_inference, run_text_inference
from app.services.inference.sam_service import sam_service

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

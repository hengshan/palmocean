"""
Inference task runner. Currently synchronous; structured for future Celery migration.
"""

import uuid
from typing import Any

from app.services.inference.sam_service import sam_service

# In-memory task status tracking
_task_status: dict[str, dict[str, Any]] = {}


async def run_point_inference(image_id: str, lng: float, lat: float, label: int = 1) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    _task_status[task_id] = {"status": "running"}

    result = await sam_service.segment_point(image_id, lng, lat, label)
    stats = result.pop("_stats", {"count": 0, "total_area": 0.0})

    response = {
        "task_id": task_id,
        "status": "completed",
        "results": result,
        "stats": stats,
    }
    _task_status[task_id] = response
    return response


async def run_box_inference(
    image_id: str, min_lng: float, min_lat: float, max_lng: float, max_lat: float
) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    _task_status[task_id] = {"status": "running"}

    result = await sam_service.segment_box(image_id, min_lng, min_lat, max_lng, max_lat)
    stats = result.pop("_stats", {"count": 0, "total_area": 0.0})

    response = {
        "task_id": task_id,
        "status": "completed",
        "results": result,
        "stats": stats,
    }
    _task_status[task_id] = response
    return response


async def run_auto_inference(
    image_id: str, bbox: tuple[float, float, float, float] | None = None
) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    _task_status[task_id] = {"status": "running"}

    result = await sam_service.segment_auto(image_id, bbox)
    stats = result.pop("_stats", {"count": 0, "total_area": 0.0})

    response = {
        "task_id": task_id,
        "status": "completed",
        "results": result,
        "stats": stats,
    }
    _task_status[task_id] = response
    return response


async def run_semantic_inference(
    image_id: str, classes: list[str], bbox: tuple[float, float, float, float] | None = None
) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    _task_status[task_id] = {"status": "running"}

    result = await sam_service.segment_semantic(image_id, classes, bbox)
    stats = result.pop("_stats", {"count": 0, "total_area": 0.0})

    response = {
        "task_id": task_id,
        "status": "completed",
        "results": result,
        "stats": stats,
    }
    _task_status[task_id] = response
    return response


async def run_text_inference(
    image_id: str, prompt: str, bbox: tuple[float, float, float, float] | None = None
) -> dict[str, Any]:
    """Text-guided inference using NL parser + semantic segmentation mock."""
    from app.services.inference.nl_parser import nl_parser

    task_id = str(uuid.uuid4())
    _task_status[task_id] = {"status": "running"}

    # Parse natural language prompt into target classes
    parsed = nl_parser.parse(prompt)

    # Use semantic segmentation with parsed classes
    result = await sam_service.segment_semantic(image_id, parsed.classes, bbox)
    stats = result.pop("_stats", {"count": 0, "total_area": 0.0})

    # Build a descriptive response message
    class_list = ", ".join(parsed.classes)
    count = stats.get("count", 0)
    area = stats.get("total_area", 0.0)

    if count > 0:
        message = f"Found {count} feature(s) matching \"{prompt}\" — classes: [{class_list}], total area: {area:.1f} m²"
    else:
        message = f"No features found matching \"{prompt}\". Try a different description or zoom to an area with imagery."

    response = {
        "task_id": task_id,
        "status": "completed",
        "results": result,
        "stats": stats,
        "message": message,
        "parsed": parsed.to_dict(),
    }
    _task_status[task_id] = response
    return response


def get_task_status(task_id: str) -> dict[str, Any] | None:
    return _task_status.get(task_id)

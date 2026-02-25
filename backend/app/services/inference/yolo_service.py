"""
YOLOv8 Detection Service — connects backend to ml/inference/yolo_server.py (port 8002).

Follows the same pattern as sam_service.py.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Default: same host as SAM2 server, port 8002
YOLO_API_URL = getattr(settings, "YOLO_INFERENCE_API_URL", "http://localhost:8002")
TIMEOUT = 60.0  # seconds


class YoloService:
    def __init__(self, base_url: str = YOLO_API_URL):
        self.base_url = base_url.rstrip("/")

    async def health_check(self) -> dict:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{self.base_url}/health")
            r.raise_for_status()
            return r.json()

    async def detect_image(
        self,
        image_id: str,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        classes: list[int] | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/detect/image",
                json={
                    "image_id": image_id,
                    "conf_threshold": conf_threshold,
                    "iou_threshold": iou_threshold,
                    "classes": classes,
                },
            )
            r.raise_for_status()
            return r.json()

    async def detect_bbox(
        self,
        image_id: str,
        min_lng: float,
        min_lat: float,
        max_lng: float,
        max_lat: float,
        conf_threshold: float = 0.25,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/detect/bbox",
                json={
                    "image_id": image_id,
                    "min_lng": min_lng,
                    "min_lat": min_lat,
                    "max_lng": max_lng,
                    "max_lat": max_lat,
                    "conf_threshold": conf_threshold,
                },
            )
            r.raise_for_status()
            return r.json()


yolo_service = YoloService()

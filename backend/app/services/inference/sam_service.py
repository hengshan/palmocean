"""
SAM inference service with pluggable backends.

Supports both MockInferenceBackend (fallback) and RemoteInferenceBackend (SAM2 server).
"""

import uuid
import math
import random
import asyncio
import logging
from typing import Any, Optional
import httpx

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.image import ImageModel
from app.config import settings


# Default Singapore area bounds
DEFAULT_BOUNDS = [103.6, 1.2, 104.0, 1.5]

logger = logging.getLogger(__name__)


def _get_image_bounds(image_id: str) -> list[float]:
    """Get image bounds from DB, fallback to Singapore."""
    try:
        db: Session = SessionLocal()
        try:
            img = db.query(ImageModel).filter(ImageModel.id == image_id).first()
            if img and img.bounds:
                return img.bounds
        finally:
            db.close()
    except Exception:
        pass
    return DEFAULT_BOUNDS


CLASS_COLORS = {
    "building": "#E74C3C",
    "road": "#F39C12",
    "vegetation": "#27AE60",
    "water": "#3498DB",
    "solar_panel": "#9B59B6",
    "unknown": "#95A5A6",
}


def _make_feature(
    polygon_coords: list[list[float]],
    confidence: float,
    cls: str = "unknown",
) -> dict[str, Any]:
    """Create a GeoJSON Feature from polygon coordinates."""
    # Compute rough area (in degrees^2, good enough for display)
    area = _shoelace_area(polygon_coords)
    return {
        "type": "Feature",
        "id": str(uuid.uuid4()),
        "geometry": {
            "type": "Polygon",
            "coordinates": [polygon_coords],
        },
        "properties": {
            "id": str(uuid.uuid4()),
            "confidence": round(confidence, 3),
            "area_sq_m": round(abs(area) * 111320 * 111320, 2),  # rough conversion
            "class": cls,
            "color": CLASS_COLORS.get(cls, CLASS_COLORS["unknown"]),
        },
    }


def _shoelace_area(coords: list[list[float]]) -> float:
    n = len(coords)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords[i][0] * coords[j][1]
        area -= coords[j][0] * coords[i][1]
    return area / 2.0


def _random_polygon_around(
    cx: float, cy: float, radius_lng: float, radius_lat: float, num_vertices: int = 6
) -> list[list[float]]:
    """Generate a random-ish polygon around a center point."""
    angles = sorted([random.uniform(0, 2 * math.pi) for _ in range(num_vertices)])
    coords = []
    for a in angles:
        r_lng = radius_lng * random.uniform(0.5, 1.0)
        r_lat = radius_lat * random.uniform(0.5, 1.0)
        coords.append([cx + r_lng * math.cos(a), cy + r_lat * math.sin(a)])
    coords.append(coords[0])  # close ring
    return coords


class InferenceBackend:
    """Base class for inference backends"""
    
    async def segment_point(
        self, image_id: str, lng: float, lat: float, label: int = 1
    ) -> dict[str, Any]:
        raise NotImplementedError
    
    async def segment_box(
        self, image_id: str, min_lng: float, min_lat: float, max_lng: float, max_lat: float
    ) -> dict[str, Any]:
        raise NotImplementedError
    
    async def segment_auto(
        self, image_id: str, bbox: tuple[float, float, float, float] | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError


class MockInferenceBackend(InferenceBackend):
    """Mock inference backend for development/fallback"""
    
    async def segment_point(
        self, image_id: str, lng: float, lat: float, label: int = 1
    ) -> dict[str, Any]:
        bounds = _get_image_bounds(image_id)
        w, s, e, n = bounds
        span_lng = (e - w) * 0.02
        span_lat = (n - s) * 0.02

        # Clamp point inside bounds
        cx = max(w + span_lng, min(e - span_lng, lng))
        cy = max(s + span_lat, min(n - span_lat, lat))

        # Generate 1-3 polygons near point
        features = []
        count = random.randint(1, 2)
        for i in range(count):
            r = 1.0 - i * 0.3
            poly = _random_polygon_around(
                cx + random.uniform(-span_lng, span_lng) * i * 0.5,
                cy + random.uniform(-span_lat, span_lat) * i * 0.5,
                span_lng * r,
                span_lat * r,
                num_vertices=random.randint(5, 8),
            )
            features.append(_make_feature(poly, random.uniform(0.75, 0.98)))

        return _make_collection(features)

    async def segment_box(
        self, image_id: str, min_lng: float, min_lat: float, max_lng: float, max_lat: float
    ) -> dict[str, Any]:
        span_lng = max_lng - min_lng
        span_lat = max_lat - min_lat

        features = []
        count = random.randint(3, 7)
        for _ in range(count):
            cx = random.uniform(min_lng + span_lng * 0.1, max_lng - span_lng * 0.1)
            cy = random.uniform(min_lat + span_lat * 0.1, max_lat - span_lat * 0.1)
            r = random.uniform(0.05, 0.2)
            poly = _random_polygon_around(
                cx, cy, span_lng * r, span_lat * r,
                num_vertices=random.randint(5, 8),
            )
            features.append(_make_feature(poly, random.uniform(0.6, 0.95)))

        return _make_collection(features)

    async def segment_semantic(
        self,
        image_id: str,
        classes: list[str],
        bbox: tuple[float, float, float, float] | None = None,
    ) -> dict[str, Any]:
        """Mock semantic segmentation — generates class-specific polygons."""
        if bbox:
            min_lng, min_lat, max_lng, max_lat = bbox
        else:
            bounds = _get_image_bounds(image_id)
            min_lng, min_lat, max_lng, max_lat = bounds

        span_lng = max_lng - min_lng
        span_lat = max_lat - min_lat

        # Class-specific generation parameters
        class_params = {
            "building": {"count": (4, 10), "size": (0.03, 0.08), "vertices": (4, 6)},
            "road": {"count": (2, 5), "size": (0.05, 0.15), "vertices": (4, 5)},
            "vegetation": {"count": (3, 8), "size": (0.05, 0.15), "vertices": (6, 10)},
            "water": {"count": (1, 3), "size": (0.08, 0.2), "vertices": (8, 12)},
            "solar_panel": {"count": (1, 4), "size": (0.02, 0.05), "vertices": (4, 5)},
        }

        features = []
        for cls in classes:
            params = class_params.get(cls, {"count": (2, 5), "size": (0.03, 0.1), "vertices": (5, 8)})
            count = random.randint(*params["count"])
            for _ in range(count):
                cx = random.uniform(min_lng + span_lng * 0.05, max_lng - span_lng * 0.05)
                cy = random.uniform(min_lat + span_lat * 0.05, max_lat - span_lat * 0.05)
                r = random.uniform(*params["size"])
                poly = _random_polygon_around(
                    cx, cy, span_lng * r, span_lat * r,
                    num_vertices=random.randint(*params["vertices"]),
                )
                features.append(_make_feature(poly, random.uniform(0.6, 0.95), cls=cls))

        return _make_collection(features)

    async def segment_auto(
        self, image_id: str, bbox: tuple[float, float, float, float] | None = None
    ) -> dict[str, Any]:
        if bbox:
            min_lng, min_lat, max_lng, max_lat = bbox
        else:
            bounds = _get_image_bounds(image_id)
            min_lng, min_lat, max_lng, max_lat = bounds

        span_lng = max_lng - min_lng
        span_lat = max_lat - min_lat

        features = []
        count = random.randint(8, 15)
        for _ in range(count):
            cx = random.uniform(min_lng + span_lng * 0.05, max_lng - span_lng * 0.05)
            cy = random.uniform(min_lat + span_lat * 0.05, max_lat - span_lat * 0.05)
            r = random.uniform(0.03, 0.12)
            poly = _random_polygon_around(
                cx, cy, span_lng * r, span_lat * r,
                num_vertices=random.randint(5, 10),
            )
            features.append(_make_feature(poly, random.uniform(0.5, 0.95)))

        return _make_collection(features)


class RemoteInferenceBackend(InferenceBackend):
    """Remote inference backend that calls SAM2 server via HTTP"""
    
    def __init__(self, api_url: str):
        self.api_url = api_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def _get_image_path(self, image_id: str) -> str:
        """Get image file path from database"""
        try:
            db: Session = SessionLocal()
            try:
                img = db.query(ImageModel).filter(ImageModel.id == image_id).first()
                if img and img.file_path:
                    return img.file_path
                else:
                    raise ValueError(f"Image not found: {image_id}")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to get image path for {image_id}: {e}")
            raise
    
    async def segment_point(
        self, image_id: str, lng: float, lat: float, label: int = 1
    ) -> dict[str, Any]:
        try:
            image_path = await self._get_image_path(image_id)
            
            payload = {
                "image_path": image_path,
                "lng": lng,
                "lat": lat,
                "label": label
            }
            
            response = await self.client.post(f"{self.api_url}/segment/point", json=payload)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Remote point segmentation failed: {e}")
            raise
    
    async def segment_box(
        self, image_id: str, min_lng: float, min_lat: float, max_lng: float, max_lat: float
    ) -> dict[str, Any]:
        try:
            image_path = await self._get_image_path(image_id)
            
            payload = {
                "image_path": image_path,
                "min_lng": min_lng,
                "min_lat": min_lat,
                "max_lng": max_lng,
                "max_lat": max_lat
            }
            
            response = await self.client.post(f"{self.api_url}/segment/box", json=payload)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Remote box segmentation failed: {e}")
            raise
    
    async def segment_auto(
        self, image_id: str, bbox: tuple[float, float, float, float] | None = None
    ) -> dict[str, Any]:
        try:
            image_path = await self._get_image_path(image_id)
            
            payload = {
                "image_path": image_path,
                "bbox": list(bbox) if bbox else None
            }
            
            response = await self.client.post(f"{self.api_url}/segment/auto", json=payload)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Remote auto segmentation failed: {e}")
            raise
    
    async def segment_semantic(
        self, image_id: str, classes: list[str],
        bbox: tuple[float, float, float, float] | None = None,
    ) -> dict[str, Any]:
        try:
            image_path = await self._get_image_path(image_id)
            
            payload = {
                "image_path": image_path,
                "classes": classes,
                "bbox": list(bbox) if bbox else None,
            }
            
            response = await self.client.post(
                f"{self.api_url}/segment/semantic", json=payload, timeout=60.0
            )
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Remote semantic segmentation failed: {e}")
            raise

    async def health_check(self) -> bool:
        """Check if the remote inference server is healthy"""
        try:
            response = await self.client.get(f"{self.api_url}/health")
            return response.status_code == 200
        except Exception:
            return False


class SAMService:
    """SAM segmentation service with pluggable backends."""

    def __init__(self) -> None:
        self.backend: InferenceBackend = self._initialize_backend()
        self._fallback_backend = MockInferenceBackend()

    def _initialize_backend(self) -> InferenceBackend:
        """Initialize the appropriate backend based on configuration"""
        inference_api_url = getattr(settings, 'inference_api_url', None)
        
        if inference_api_url:
            logger.info(f"Using RemoteInferenceBackend with URL: {inference_api_url}")
            return RemoteInferenceBackend(inference_api_url)
        else:
            logger.info("Using MockInferenceBackend")
            return MockInferenceBackend()

    async def _call_with_fallback(self, method_name: str, *args, **kwargs) -> dict[str, Any]:
        """Call backend method with fallback to mock on failure"""
        try:
            method = getattr(self.backend, method_name)
            result = await method(*args, **kwargs)
            return result
        except Exception as e:
            logger.warning(f"Primary backend failed ({e}), falling back to mock")
            fallback_method = getattr(self._fallback_backend, method_name)
            return await fallback_method(*args, **kwargs)

    async def segment_point(
        self, image_id: str, lng: float, lat: float, label: int = 1
    ) -> dict[str, Any]:
        return await self._call_with_fallback("segment_point", image_id, lng, lat, label)

    async def segment_box(
        self, image_id: str, min_lng: float, min_lat: float, max_lng: float, max_lat: float
    ) -> dict[str, Any]:
        return await self._call_with_fallback("segment_box", image_id, min_lng, min_lat, max_lng, max_lat)

    async def segment_auto(
        self, image_id: str, bbox: tuple[float, float, float, float] | None = None
    ) -> dict[str, Any]:
        return await self._call_with_fallback("segment_auto", image_id, bbox)

    async def segment_semantic(
        self, image_id: str, classes: list[str],
        bbox: tuple[float, float, float, float] | None = None,
    ) -> dict[str, Any]:
        return await self._call_with_fallback("segment_semantic", image_id, classes, bbox)

    async def health_check(self) -> dict[str, Any]:
        """Check the health of the inference backend"""
        backend_type = type(self.backend).__name__
        
        if isinstance(self.backend, RemoteInferenceBackend):
            is_healthy = await self.backend.health_check()
            return {
                "backend": backend_type,
                "healthy": is_healthy,
                "fallback_available": True
            }
        else:
            return {
                "backend": backend_type,
                "healthy": True,
                "fallback_available": True
            }


def _make_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    total_area = sum(f["properties"]["area_sq_m"] for f in features)
    return {
        "type": "FeatureCollection",
        "features": features,
        "_stats": {"count": len(features), "total_area": round(total_area, 2)},
    }


# Singleton
sam_service = SAMService()

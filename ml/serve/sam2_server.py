#!/usr/bin/env python3
"""
SAM2 Inference Server — FastAPI service on port 8001.

Provides segmentation endpoints backed by SAM2 (Segment Anything Model 2).
Supports GeoTIFF inputs (georeferenced) and plain RGB images.

Usage:
    cd ~/projects/palmview
    python ml/serve/sam2_server.py
    # OR:
    uvicorn ml.serve.sam2_server:app --host 0.0.0.0 --port 8001
"""

from __future__ import annotations

import json
import logging
import math
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sam2_server")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # ~/projects/palmview
WEIGHTS_DIR = PROJECT_ROOT / "ml" / "weights"
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Try importing SAM2 (install if missing)
# ---------------------------------------------------------------------------
try:
    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    SAM2_AVAILABLE = True
    logger.info("SAM2 imported successfully")
except ImportError as _err:
    logger.warning("SAM2 not found (%s). Attempting pip install …", _err)
    try:
        import subprocess, sys
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-q",
             "segment-anything-2", "torch", "torchvision"],
            stdout=subprocess.DEVNULL,
        )
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
        SAM2_AVAILABLE = True
        logger.info("SAM2 installed and imported successfully")
    except Exception as install_err:
        logger.error("Failed to install/import SAM2: %s", install_err)
        SAM2_AVAILABLE = False

# ---------------------------------------------------------------------------
# Model weights — download if needed
# ---------------------------------------------------------------------------

MODEL_CONFIGS = {
    "sam2.1_hiera_large": {
        "config": "configs/sam2.1/sam2.1_hiera_l.yaml",
        "ckpt": "sam2.1_hiera_large.pt",
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt",
    },
    "sam2.1_hiera_base_plus": {
        "config": "configs/sam2.1/sam2.1_hiera_b+.yaml",
        "ckpt": "sam2.1_hiera_base_plus.pt",
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt",
    },
}

# ---------------------------------------------------------------------------
# Global model state
# ---------------------------------------------------------------------------

_predictor: Optional["SAM2ImagePredictor"] = None
_auto_generator: Optional["SAM2AutomaticMaskGenerator"] = None
_active_model: str = "none"
_device: str = "cpu"


def _download_weights(model_name: str) -> Path:
    """Download model weights if not present."""
    cfg = MODEL_CONFIGS[model_name]
    ckpt_path = WEIGHTS_DIR / cfg["ckpt"]
    if ckpt_path.exists():
        logger.info("Weights already exist: %s", ckpt_path)
        return ckpt_path

    import urllib.request
    url = cfg["url"]
    logger.info("Downloading SAM2 weights from %s → %s", url, ckpt_path)
    try:
        urllib.request.urlretrieve(url, ckpt_path)
        logger.info("Download complete: %.1f MB", ckpt_path.stat().st_size / 1e6)
    except Exception as e:
        logger.error("Failed to download weights: %s", e)
        raise RuntimeError(f"Cannot download {url}: {e}") from e
    return ckpt_path


def _load_model():
    """Load SAM2 model into GPU memory."""
    global _predictor, _auto_generator, _active_model, _device

    if not SAM2_AVAILABLE:
        logger.warning("SAM2 not available — running in mock mode")
        return

    if SAM2_AVAILABLE:
        import torch as _torch
        _device = "cuda" if _torch.cuda.is_available() else "cpu"
        logger.info("Using device: %s", _device)

    # Try large model first, fall back to base+
    for model_name, cfg in MODEL_CONFIGS.items():
        try:
            ckpt_path = _download_weights(model_name)
            logger.info("Building SAM2 model: %s", model_name)
            sam2_model = build_sam2(
                cfg["config"],
                str(ckpt_path),
                device=_device,
            )
            _predictor = SAM2ImagePredictor(sam2_model)
            _auto_generator = SAM2AutomaticMaskGenerator(
                model=sam2_model,
                points_per_side=32,
                pred_iou_thresh=0.75,
                stability_score_thresh=0.85,
                box_nms_thresh=0.7,
                min_mask_region_area=200,
            )
            _active_model = model_name
            logger.info("SAM2 model loaded: %s on %s", model_name, _device)
            return
        except Exception as e:
            logger.warning("Failed to load %s: %s — trying next …", model_name, e)

    logger.error("All SAM2 models failed to load. Falling back to mock mode.")


# ---------------------------------------------------------------------------
# Image loading helpers
# ---------------------------------------------------------------------------

def _load_image_and_transform(image_path: str):
    """
    Load an image file (GeoTIFF or RGB).

    Returns:
        (rgb_array: np.ndarray HxWx3 uint8,
         geo_transform: callable(px, py) -> (lng, lat) | None,
         image_bounds: (min_lng, min_lat, max_lng, max_lat) | None)
    """
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    suffix = path.suffix.lower()

    # --- GeoTIFF branch ---
    if suffix in (".tif", ".tiff"):
        try:
            import rasterio
            from rasterio.enums import Resampling

            with rasterio.open(image_path) as src:
                # Read first 3 bands as RGB (or fewer if single-band)
                band_count = min(src.count, 3)
                data = src.read(list(range(1, band_count + 1)))  # (C, H, W)

                # Normalise to uint8
                rgb = np.zeros((data.shape[1], data.shape[2], 3), dtype=np.uint8)
                for i in range(band_count):
                    band = data[i].astype(np.float32)
                    b_min, b_max = band.min(), band.max()
                    if b_max > b_min:
                        band = (band - b_min) / (b_max - b_min) * 255
                    rgb[:, :, i] = band.astype(np.uint8)
                if band_count == 1:
                    rgb[:, :, 1] = rgb[:, :, 0]
                    rgb[:, :, 2] = rgb[:, :, 0]

                transform = src.transform
                crs = src.crs
                width, height = src.width, src.height

                # Try to reproject CRS to WGS84 for lng/lat
                try:
                    from pyproj import Transformer
                    transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)

                    def geo_transform(px: float, py: float):
                        """Pixel (col, row) → (lng, lat)."""
                        x, y = transform * (px + 0.5, py + 0.5)
                        lng, lat = transformer.transform(x, y)
                        return lng, lat

                except ImportError:
                    # No pyproj — assume CRS is already WGS84
                    def geo_transform(px: float, py: float):
                        x, y = transform * (px + 0.5, py + 0.5)
                        return x, y  # treat as lng, lat

                # Compute bounds
                corners = [
                    geo_transform(0, 0),
                    geo_transform(width - 1, 0),
                    geo_transform(0, height - 1),
                    geo_transform(width - 1, height - 1),
                ]
                lngs = [c[0] for c in corners]
                lats = [c[1] for c in corners]
                bounds = (min(lngs), min(lats), max(lngs), max(lats))
                return rgb, geo_transform, bounds, (height, width)

        except ImportError:
            logger.warning("rasterio not available — loading GeoTIFF as plain image")

    # --- Plain image branch ---
    try:
        from PIL import Image
        img = Image.open(image_path).convert("RGB")
        rgb = np.array(img, dtype=np.uint8)
        return rgb, None, None, rgb.shape[:2]
    except ImportError:
        import cv2  # type: ignore
        img = cv2.imread(image_path)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return rgb, None, None, rgb.shape[:2]


def _pixel_to_geo(
    px: float, py: float,
    img_shape: tuple[int, int],
    geo_transform=None,
    bbox: Optional[tuple] = None,
) -> tuple[float, float]:
    """Convert pixel (col, row) to (lng, lat)."""
    if geo_transform is not None:
        return geo_transform(px, py)
    if bbox is not None:
        h, w = img_shape
        lng = bbox[0] + (px / w) * (bbox[2] - bbox[0])
        lat = bbox[3] - (py / h) * (bbox[3] - bbox[1])  # row 0 = top = max_lat
        return lng, lat
    # No geo ref: return normalised coords
    h, w = img_shape
    return px / w, py / h


def _mask_to_polygon(
    mask: np.ndarray,
    img_shape: tuple[int, int],
    geo_transform=None,
    bbox: Optional[tuple] = None,
    simplify_pixels: int = 3,
) -> Optional[dict]:
    """
    Convert a boolean mask to a GeoJSON Polygon.
    Returns None if the mask has no valid contours.
    """
    try:
        import cv2  # type: ignore

        mask_u8 = (mask.astype(np.uint8)) * 255
        contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        # Pick the largest contour
        contour = max(contours, key=cv2.contourArea)
        if len(contour) < 3:
            return None

        # Simplify
        epsilon = simplify_pixels * cv2.arcLength(contour, True) / 1000.0
        contour = cv2.approxPolyDP(contour, epsilon, True)
        if len(contour) < 3:
            return None

        # Convert pixel coords → geo coords
        ring = []
        for pt in contour:
            px, py = float(pt[0][0]), float(pt[0][1])
            lng, lat = _pixel_to_geo(px, py, img_shape, geo_transform, bbox)
            ring.append([round(lng, 7), round(lat, 7)])
        ring.append(ring[0])  # close ring

        return {"type": "Polygon", "coordinates": [ring]}

    except ImportError:
        # cv2 not available — use simple bounding box polygon
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        if not rows.any():
            return None
        r_min, r_max = np.where(rows)[0][[0, -1]]
        c_min, c_max = np.where(cols)[0][[0, -1]]

        corners = [
            (float(c_min), float(r_min)),
            (float(c_max), float(r_min)),
            (float(c_max), float(r_max)),
            (float(c_min), float(r_max)),
        ]
        ring = []
        for px, py in corners:
            lng, lat = _pixel_to_geo(px, py, img_shape, geo_transform, bbox)
            ring.append([round(lng, 7), round(lat, 7)])
        ring.append(ring[0])
        return {"type": "Polygon", "coordinates": [ring]}


def _area_sq_m(mask: np.ndarray, bounds: Optional[tuple]) -> float:
    """Rough area estimate in square metres based on mask pixel count and bounds extent."""
    if bounds is None:
        return float(mask.sum())

    h, w = mask.shape
    # Metres per pixel (approximate at the centroid latitude)
    lat_center = (bounds[1] + bounds[3]) / 2
    m_per_deg_lat = 111_320.0
    m_per_deg_lng = 111_320.0 * math.cos(math.radians(lat_center))

    total_area_m2 = (
        abs(bounds[2] - bounds[0]) * m_per_deg_lng
        * abs(bounds[3] - bounds[1]) * m_per_deg_lat
    )
    pixel_fraction = mask.sum() / (h * w)
    return round(total_area_m2 * pixel_fraction, 2)


def _make_feature(
    geom: dict,
    confidence: float,
    area_sq_m: float,
    cls: str = "unknown",
    extra: Optional[dict] = None,
) -> dict:
    props = {
        "confidence": round(float(confidence), 4),
        "area_sq_m": area_sq_m,
        "class": cls,
        "feature_id": str(uuid.uuid4()),
    }
    if extra:
        props.update(extra)
    return {"type": "Feature", "geometry": geom, "properties": props}


# ---------------------------------------------------------------------------
# Mock fallback (when SAM2 unavailable)
# ---------------------------------------------------------------------------

def _mock_features(bbox: Optional[tuple], n: int = 5) -> list[dict]:
    """Generate dummy polygon features for testing without a real model."""
    import random

    rng = random.Random(42)
    if bbox is None:
        bbox = (0.0, 0.0, 1.0, 1.0)
    min_lng, min_lat, max_lng, max_lat = bbox
    features = []
    for _ in range(n):
        cx = rng.uniform(min_lng, max_lng)
        cy = rng.uniform(min_lat, max_lat)
        dx = (max_lng - min_lng) * 0.01
        dy = (max_lat - min_lat) * 0.01
        ring = [
            [cx - dx, cy - dy],
            [cx + dx, cy - dy],
            [cx + dx, cy + dy],
            [cx - dx, cy + dy],
            [cx - dx, cy - dy],
        ]
        geom = {"type": "Polygon", "coordinates": [ring]}
        features.append(_make_feature(geom, rng.uniform(0.5, 0.95), rng.uniform(10, 200), "palm_tree"))
    return features


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="SAM2 Inference Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Load the model at startup (non-blocking — runs in thread pool)."""
    import asyncio

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_model)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class PointRequest(BaseModel):
    image_path: str
    lng: float
    lat: float
    label: int = 1  # 1 = foreground, 0 = background
    bbox: Optional[list[float]] = None  # [min_lng, min_lat, max_lng, max_lat]


class BoxRequest(BaseModel):
    image_path: str
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float
    image_bbox: Optional[list[float]] = None  # full image geo bbox if not GeoTIFF


class AutoRequest(BaseModel):
    image_path: str
    bbox: Optional[list[float]] = None  # [min_lng, min_lat, max_lng, max_lat]


class SemanticRequest(BaseModel):
    image_path: str
    classes: list[str]
    bbox: Optional[list[float]] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": _active_model,
        "device": _device,
        "sam2_available": SAM2_AVAILABLE,
    }


@app.post("/segment/point")
async def segment_point(req: PointRequest):
    """
    Point-prompted segmentation.
    Accepts image_path + geographic coordinate (lng, lat).
    Returns GeoJSON FeatureCollection.
    """
    try:
        rgb, geo_tf, bounds, img_shape = _load_image_and_transform(req.image_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image load error: {e}")

    image_bbox = tuple(req.bbox) if req.bbox else bounds

    if not SAM2_AVAILABLE or _predictor is None:
        # Mock
        features = _mock_features(image_bbox, n=1)
        return {"type": "FeatureCollection", "features": features}

    # Convert geo point to pixel
    h, w = img_shape
    if geo_tf is not None and bounds is not None:
        # Approximate inverse: use bounds for linear mapping (close enough)
        px = int((req.lng - bounds[0]) / (bounds[2] - bounds[0]) * w)
        py = int((bounds[3] - req.lat) / (bounds[3] - bounds[1]) * h)
    elif image_bbox is not None:
        px = int((req.lng - image_bbox[0]) / (image_bbox[2] - image_bbox[0]) * w)
        py = int((image_bbox[3] - req.lat) / (image_bbox[3] - image_bbox[1]) * h)
    else:
        px, py = w // 2, h // 2

    px = max(0, min(w - 1, px))
    py = max(0, min(h - 1, py))

    import torch as _torch

    with _torch.inference_mode(), _torch.autocast(_device, dtype=_torch.bfloat16):
        _predictor.set_image(rgb)
        masks, scores, _ = _predictor.predict(
            point_coords=np.array([[px, py]], dtype=np.float32),
            point_labels=np.array([req.label], dtype=np.int32),
            multimask_output=True,
        )

    features = []
    for mask, score in zip(masks, scores):
        geom = _mask_to_polygon(mask, img_shape, geo_tf, image_bbox)
        if geom:
            area = _area_sq_m(mask, image_bbox)
            features.append(_make_feature(geom, float(score), area, "segment"))

    return {"type": "FeatureCollection", "features": features}


@app.post("/segment/box")
async def segment_box(req: BoxRequest):
    """
    Box-prompted segmentation.
    Accepts image_path + geographic bounding box (min_lng, min_lat, max_lng, max_lat).
    Returns GeoJSON FeatureCollection.
    """
    try:
        rgb, geo_tf, bounds, img_shape = _load_image_and_transform(req.image_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image load error: {e}")

    image_bbox = tuple(req.image_bbox) if req.image_bbox else bounds

    if not SAM2_AVAILABLE or _predictor is None:
        features = _mock_features(image_bbox, n=3)
        return {"type": "FeatureCollection", "features": features}

    h, w = img_shape

    def _geo_to_pixel(lng, lat):
        if image_bbox is not None:
            px = (lng - image_bbox[0]) / (image_bbox[2] - image_bbox[0]) * w
            py = (image_bbox[3] - lat) / (image_bbox[3] - image_bbox[1]) * h
            return max(0, min(w - 1, int(px))), max(0, min(h - 1, int(py)))
        return w // 4, h // 4

    x1, y1 = _geo_to_pixel(req.min_lng, req.max_lat)
    x2, y2 = _geo_to_pixel(req.max_lng, req.min_lat)
    box = np.array([x1, y1, x2, y2], dtype=np.float32)

    import torch as _torch

    with _torch.inference_mode(), _torch.autocast(_device, dtype=_torch.bfloat16):
        _predictor.set_image(rgb)
        masks, scores, _ = _predictor.predict(
            point_coords=None,
            point_labels=None,
            box=box[None, :],
            multimask_output=False,
        )

    features = []
    for mask, score in zip(masks, scores):
        geom = _mask_to_polygon(mask, img_shape, geo_tf, image_bbox)
        if geom:
            area = _area_sq_m(mask, image_bbox)
            features.append(_make_feature(geom, float(score), area, "segment"))

    return {"type": "FeatureCollection", "features": features}


@app.post("/segment/auto")
async def segment_auto(req: AutoRequest):
    """
    Automatic mask generation (no prompts).
    Accepts image_path + optional geo bbox.
    Returns GeoJSON FeatureCollection.
    """
    try:
        rgb, geo_tf, bounds, img_shape = _load_image_and_transform(req.image_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image load error: {e}")

    image_bbox = tuple(req.bbox) if req.bbox else bounds

    if not SAM2_AVAILABLE or _auto_generator is None:
        features = _mock_features(image_bbox, n=8)
        return {"type": "FeatureCollection", "features": features}

    masks_data = _auto_generator.generate(rgb)

    features = []
    for item in masks_data:
        mask = item["segmentation"]  # bool H×W
        score = item.get("predicted_iou", item.get("stability_score", 0.8))
        geom = _mask_to_polygon(mask, img_shape, geo_tf, image_bbox)
        if geom:
            area = _area_sq_m(mask, image_bbox)
            features.append(_make_feature(
                geom, float(score), area, "segment",
                extra={"stability_score": round(float(item.get("stability_score", 0)), 4)},
            ))

    return {"type": "FeatureCollection", "features": features}


@app.post("/segment/semantic")
async def segment_semantic(req: SemanticRequest):
    """
    Semantic segmentation (auto-segment + random class assignment).
    True semantic classification requires Prithvi — placeholder implementation.
    Accepts image_path, classes list, optional bbox.
    Returns GeoJSON FeatureCollection with class property set.
    """
    import random

    try:
        rgb, geo_tf, bounds, img_shape = _load_image_and_transform(req.image_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image load error: {e}")

    image_bbox = tuple(req.bbox) if req.bbox else bounds
    classes = req.classes if req.classes else ["unknown"]

    if not SAM2_AVAILABLE or _auto_generator is None:
        features = _mock_features(image_bbox, n=len(classes) * 2)
        for i, f in enumerate(features):
            f["properties"]["class"] = classes[i % len(classes)]
        return {"type": "FeatureCollection", "features": features}

    masks_data = _auto_generator.generate(rgb)

    rng = random.Random(42)
    features = []
    for item in masks_data:
        mask = item["segmentation"]
        score = item.get("predicted_iou", item.get("stability_score", 0.8))
        assigned_class = rng.choice(classes)  # placeholder: random assignment
        geom = _mask_to_polygon(mask, img_shape, geo_tf, image_bbox)
        if geom:
            area = _area_sq_m(mask, image_bbox)
            features.append(_make_feature(geom, float(score), area, assigned_class))

    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("SAM2_PORT", "8001"))
    logger.info("Starting SAM2 server on port %d …", port)
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )

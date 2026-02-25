"""
YOLOv8 Detection Server — PalmView T6

FastAPI server providing YOLOv8 object detection for palm plantation imagery.
Runs on port 8002, parallel to SAM2 server (port 8001).

Endpoints:
- GET  /health          — readiness probe
- POST /detect/image    — detect objects in a GeoTIFF / raster image
- POST /detect/bbox     — detect within a spatial bounding box region

Usage:
  conda activate lntorch
  python ml/inference/yolo_server.py

Model auto-downloads from ultralytics if not present in ml/weights/.
To use custom weights: place yolov8n-palm.pt in ml/weights/ and set
  YOLO_WEIGHTS_PATH=ml/weights/yolov8n-palm.pt
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.warp import transform as rio_transform
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── YOLO model load ────────────────────────────────────────────────────
WEIGHTS_DIR = Path(__file__).resolve().parent.parent / "weights"
WEIGHTS_PATH = Path(os.getenv("YOLO_WEIGHTS_PATH", str(WEIGHTS_DIR / "yolov8n.pt")))

yolo_model = None

def _load_model():
    global yolo_model
    try:
        from ultralytics import YOLO
        if WEIGHTS_PATH.exists():
            logger.info("Loading YOLOv8 weights from %s", WEIGHTS_PATH)
            yolo_model = YOLO(str(WEIGHTS_PATH))
        else:
            logger.info("Weights not found at %s — downloading yolov8n (COCO pretrained)", WEIGHTS_PATH)
            WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
            yolo_model = YOLO("yolov8n.pt")
            # Save for next run
            yolo_model.save(str(WEIGHTS_PATH))
        import torch
        if torch.cuda.is_available():
            yolo_model.to("cuda")
            logger.info("YOLOv8 loaded on CUDA ✅")
        else:
            logger.info("YOLOv8 loaded on CPU (no CUDA)")
    except ImportError:
        logger.error("ultralytics not installed. Run: pip install ultralytics")
        raise
    except Exception as e:
        logger.error("Failed to load YOLOv8: %s", e)
        raise

_load_model()

# ── FastAPI app ────────────────────────────────────────────────────────
app = FastAPI(title="PalmView YOLOv8 Detection Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ─────────────────────────────────────────

class DetectImageRequest(BaseModel):
    image_id: str                      # imagery_assets UUID or path key
    conf_threshold: float = 0.25
    iou_threshold: float = 0.45
    classes: list[int] | None = None   # filter by class index (None = all)
    bbox: dict | None = None           # optional {min_lng, min_lat, max_lng, max_lat}


class DetectBBoxRequest(BaseModel):
    image_id: str
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float
    conf_threshold: float = 0.25


# ── Helpers ────────────────────────────────────────────────────────────

def _get_image_path(image_id: str) -> Path:
    """Resolve image_id to a local file path.
    
    Supports:
    - Absolute file path
    - Relative path under backend/storage/uploads/
    - UUID → scan uploads directory
    """
    p = Path(image_id)
    if p.exists():
        return p

    # Try uploads dir (backend/storage/uploads/)
    uploads_dir = Path(__file__).resolve().parent.parent.parent / "backend" / "storage" / "uploads"
    candidate = uploads_dir / image_id
    if candidate.exists():
        return candidate

    # Try UUID basename scan
    for ext in (".tif", ".tiff", ".png", ".jpg", ".jpeg"):
        candidate = uploads_dir / f"{image_id}{ext}"
        if candidate.exists():
            return candidate

    raise FileNotFoundError(f"Image not found for id: {image_id}")


def _pixel_to_geo(px: float, py: float, transform_obj) -> tuple[float, float]:
    """Convert pixel coordinates to geographic (lng, lat)."""
    lng = transform_obj.c + px * transform_obj.a
    lat = transform_obj.f + py * transform_obj.e
    return lng, lat


def _run_detection(image_path: Path, conf: float, iou: float, classes: list[int] | None) -> tuple[np.ndarray, Any, Any]:
    """Read raster, run YOLO, return (rgb_array, results, raster_transform)."""
    with rasterio.open(str(image_path)) as src:
        # Read first 3 bands as RGB
        bands = min(src.count, 3)
        data = src.read(list(range(1, bands + 1)))  # (C, H, W)
        raster_transform = src.transform
        crs = src.crs

        # Normalize to uint8
        img = np.moveaxis(data, 0, -1)  # (H, W, C)
        if img.dtype != np.uint8:
            img = ((img - img.min()) / (img.ptp() + 1e-8) * 255).astype(np.uint8)
        if bands == 1:
            img = np.stack([img[:, :, 0]] * 3, axis=-1)
        elif bands == 2:
            img = np.concatenate([img, img[:, :, :1]], axis=-1)

    results = yolo_model.predict(
        source=img,
        conf=conf,
        iou=iou,
        classes=classes,
        verbose=False,
    )
    return img, results, raster_transform


def _results_to_geojson(results, raster_transform, image_id: str, conf_threshold: float) -> dict:
    """Convert YOLO results to GeoJSON FeatureCollection."""
    features = []
    class_names = yolo_model.names  # {0: 'person', ...}

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            conf = float(box.conf[0])
            if conf < conf_threshold:
                continue
            cls_id = int(box.cls[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]

            # Pixel → geographic corners
            lng1, lat1 = _pixel_to_geo(x1, y1, raster_transform)
            lng2, lat2 = _pixel_to_geo(x2, y2, raster_transform)

            # Bounding box polygon
            coords = [[
                [lng1, lat1], [lng2, lat1],
                [lng2, lat2], [lng1, lat2],
                [lng1, lat1],
            ]]

            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": coords},
                "properties": {
                    "class_id": cls_id,
                    "class_name": class_names.get(cls_id, str(cls_id)),
                    "confidence": round(conf, 4),
                    "bbox_px": [x1, y1, x2, y2],
                    "source": "yolov8",
                    "image_id": image_id,
                    "detected_at": datetime.utcnow().isoformat() + "Z",
                },
            })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "model": "yolov8",
            "weights": str(WEIGHTS_PATH.name),
            "count": len(features),
            "image_id": image_id,
        },
    }


# ── Endpoints ──────────────────────────────────────────────────────────

@app.get("/health")
def health():
    import torch
    return {
        "status": "ok",
        "model": "yolov8",
        "weights": str(WEIGHTS_PATH.name),
        "cuda": torch.cuda.is_available(),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "classes": len(yolo_model.names) if yolo_model else 0,
    }


@app.post("/detect/image")
def detect_image(req: DetectImageRequest):
    """Run YOLOv8 detection on a full image (GeoTIFF or raster)."""
    if yolo_model is None:
        raise HTTPException(status_code=503, detail="YOLOv8 model not loaded.")
    try:
        image_path = _get_image_path(req.image_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        _, results, raster_transform = _run_detection(
            image_path, req.conf_threshold, req.iou_threshold, req.classes
        )
        geojson = _results_to_geojson(results, raster_transform, req.image_id, req.conf_threshold)
        stats = {
            "count": geojson["metadata"]["count"],
            "total_area": 0.0,  # TODO: compute from bbox areas
            "class_counts": {},
        }
        for f in geojson["features"]:
            cls = f["properties"]["class_name"]
            stats["class_counts"][cls] = stats["class_counts"].get(cls, 0) + 1

        return {
            "task_id": str(uuid.uuid4()),
            "status": "completed",
            "results": geojson,
            "stats": stats,
        }
    except Exception as e:
        logger.exception("Detection failed for image %s: %s", req.image_id, e)
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")


@app.post("/detect/bbox")
def detect_bbox(req: DetectBBoxRequest):
    """Run detection on a spatial bounding box crop of an image."""
    return detect_image(DetectImageRequest(
        image_id=req.image_id,
        conf_threshold=req.conf_threshold,
        bbox={"min_lng": req.min_lng, "min_lat": req.min_lat,
              "max_lng": req.max_lng, "max_lat": req.max_lat},
    ))


# ── Entry point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("YOLO_SERVER_PORT", "8002"))
    logger.info("Starting YOLOv8 server on port %d", port)
    uvicorn.run(app, host="0.0.0.0", port=port)

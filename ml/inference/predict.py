#!/usr/bin/env python3
"""
PalmView Inference Script — Run semantic segmentation on images.

Outputs GeoJSON with detected features + class labels.
Supports single image or directory batch processing.

Usage:
    python ml/inference/predict.py \
        --checkpoint runs/exp1/weights/best.pt \
        --config ml/configs/default.yaml \
        --input path/to/image.tif \
        --output results.geojson

    # Batch:
    python ml/inference/predict.py \
        --checkpoint runs/exp1/weights/best.pt \
        --config ml/configs/default.yaml \
        --input path/to/images/ \
        --output results/
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import yaml

import torch
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.models.palmview_model import PalmViewModel
from ml.training.dataset import PRITHVI_MEAN, PRITHVI_STD


# Class names and colors matching frontend
CLASS_INFO = {
    0: {"name": "background", "color": "#95A5A6"},
    1: {"name": "building", "color": "#E74C3C"},
    2: {"name": "road", "color": "#F39C12"},
    3: {"name": "vegetation", "color": "#27AE60"},
    4: {"name": "water", "color": "#3498DB"},
    5: {"name": "solar_panel", "color": "#9B59B6"},
}


def load_image(path: Path, image_size: int = 512) -> tuple[torch.Tensor, dict]:
    """Load and preprocess an image for inference.

    Returns:
        (tensor [1, C, H, W], metadata dict with original size and geo info)
    """
    metadata = {"path": str(path), "width": 0, "height": 0, "transform": None, "crs": None}

    try:
        import rasterio
        with rasterio.open(path) as src:
            img = src.read()  # [C, H, W]
            metadata["width"] = src.width
            metadata["height"] = src.height
            metadata["transform"] = src.transform
            metadata["crs"] = str(src.crs) if src.crs else None
            metadata["bounds"] = list(src.bounds)
            img = img.transpose(1, 2, 0).astype(np.float32)  # [H, W, C]
    except (ImportError, Exception):
        img = np.array(Image.open(path).convert("RGB"), dtype=np.float32)
        metadata["width"] = img.shape[1]
        metadata["height"] = img.shape[0]

    # Resize
    pil_img = Image.fromarray(img.astype(np.uint8) if img.max() > 1 else (img * 255).astype(np.uint8))
    pil_img = pil_img.resize((image_size, image_size), Image.BILINEAR)
    img = np.array(pil_img, dtype=np.float32)

    # Normalize
    if img.max() > 1.0:
        img = img / 255.0
    mean = np.array(PRITHVI_MEAN[:img.shape[-1]], dtype=np.float32)
    std = np.array(PRITHVI_STD[:img.shape[-1]], dtype=np.float32)
    img = (img - mean) / std

    tensor = torch.from_numpy(img.transpose(2, 0, 1)).float().unsqueeze(0)
    return tensor, metadata


def mask_to_polygons(mask: np.ndarray, metadata: dict, class_info: dict) -> list[dict]:
    """Convert segmentation mask to GeoJSON features.

    Uses rasterio.features.shapes for vectorization if available,
    otherwise falls back to simple contour-based approach.
    """
    features = []
    has_geo = metadata.get("transform") is not None and metadata.get("crs") is not None

    try:
        import rasterio.features
        from shapely.geometry import shape as shapely_shape, mapping

        # Resize mask to original image size if we have geo info
        if has_geo:
            from PIL import Image as PILImage
            mask_img = PILImage.fromarray(mask.astype(np.uint8))
            mask_img = mask_img.resize((metadata["width"], metadata["height"]), PILImage.NEAREST)
            mask_resized = np.array(mask_img, dtype=np.int32)
        else:
            mask_resized = mask.astype(np.int32)

        transform = metadata.get("transform")

        for class_id in np.unique(mask_resized):
            if class_id == 0:  # skip background
                continue

            binary = (mask_resized == class_id).astype(np.uint8)

            kwargs = {"transform": transform} if has_geo and transform else {}
            for geom, value in rasterio.features.shapes(binary, mask=binary > 0, **kwargs):
                shp = shapely_shape(geom)
                if shp.area < 1e-10:
                    continue

                info = class_info.get(int(class_id), {"name": "unknown", "color": "#95A5A6"})
                features.append({
                    "type": "Feature",
                    "geometry": mapping(shp),
                    "properties": {
                        "class": info["name"],
                        "class_id": int(class_id),
                        "color": info["color"],
                        "area_sq_m": round(shp.area * 111320 * 111320, 2) if has_geo else round(shp.area, 2),
                        "confidence": 1.0,
                    },
                })

    except ImportError:
        # Fallback: report class pixel counts without vectorization
        for class_id in np.unique(mask):
            if class_id == 0:
                continue
            count = int((mask == class_id).sum())
            info = class_info.get(int(class_id), {"name": "unknown", "color": "#95A5A6"})

            # Create a simple bounding box from mask
            ys, xs = np.where(mask == class_id)
            if len(ys) == 0:
                continue

            if has_geo and metadata.get("bounds"):
                bounds = metadata["bounds"]
                h, w = mask.shape
                x_min = bounds[0] + (xs.min() / w) * (bounds[2] - bounds[0])
                x_max = bounds[0] + (xs.max() / w) * (bounds[2] - bounds[0])
                y_min = bounds[1] + (1 - ys.max() / h) * (bounds[3] - bounds[1])
                y_max = bounds[1] + (1 - ys.min() / h) * (bounds[3] - bounds[1])
            else:
                x_min, x_max = float(xs.min()), float(xs.max())
                y_min, y_max = float(ys.min()), float(ys.max())

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [x_min, y_min], [x_max, y_min],
                        [x_max, y_max], [x_min, y_max],
                        [x_min, y_min],
                    ]],
                },
                "properties": {
                    "class": info["name"],
                    "class_id": int(class_id),
                    "color": info["color"],
                    "pixel_count": count,
                    "confidence": 1.0,
                },
            })

    return features


def predict_single(
    model: PalmViewModel,
    image_path: Path,
    device: torch.device,
    image_size: int = 512,
) -> dict:
    """Run prediction on a single image, return GeoJSON FeatureCollection."""
    tensor, metadata = load_image(image_path, image_size)
    tensor = tensor.to(device)

    model.eval()
    with torch.no_grad():
        logits = model(tensor)
        pred = logits.argmax(dim=1).squeeze(0).cpu().numpy()

    features = mask_to_polygons(pred, metadata, CLASS_INFO)

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "source": str(image_path),
            "num_features": len(features),
            "classes_detected": list({f["properties"]["class"] for f in features}),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="PalmView Inference")
    parser.add_argument("--checkpoint", type=str, required=True)
    parser.add_argument("--config", type=str, default="ml/configs/default.yaml")
    parser.add_argument("--input", type=str, required=True, help="Image path or directory")
    parser.add_argument("--output", type=str, required=True, help="Output GeoJSON path or directory")
    parser.add_argument("--device", type=str, default=None)
    parser.add_argument("--image_size", type=int, default=512)
    args = parser.parse_args()

    device = torch.device(args.device) if args.device else torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Load model
    model = PalmViewModel.from_checkpoint(args.checkpoint, args.config).to(device)
    print(f"Model loaded from {args.checkpoint}")

    input_path = Path(args.input)
    output_path = Path(args.output)

    if input_path.is_file():
        result = predict_single(model, input_path, device, args.image_size)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Results: {len(result['features'])} features → {output_path}")

    elif input_path.is_dir():
        output_path.mkdir(parents=True, exist_ok=True)
        image_exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
        images = [p for p in input_path.iterdir() if p.suffix.lower() in image_exts]
        print(f"Processing {len(images)} images...")

        for img_path in sorted(images):
            result = predict_single(model, img_path, device, args.image_size)
            out_file = output_path / f"{img_path.stem}.geojson"
            with open(out_file, "w") as f:
                json.dump(result, f, indent=2)
            print(f"  {img_path.name}: {len(result['features'])} features")

        print(f"Done. Results in {output_path}/")
    else:
        print(f"Error: {input_path} not found")
        sys.exit(1)


if __name__ == "__main__":
    main()

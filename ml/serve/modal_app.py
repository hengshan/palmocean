"""PalmView SAM2 inference on Modal serverless GPU.

Deploy:   modal deploy ml/serve/modal_app.py
Dev run:  modal serve ml/serve/modal_app.py

Env vars needed: MODAL_TOKEN_ID, MODAL_TOKEN_SECRET
"""

from __future__ import annotations

import modal

# ---------------------------------------------------------------------------
# Modal app & image
# ---------------------------------------------------------------------------

app = modal.App("palmview-inference")

sam2_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.3",
        "torchvision>=0.18",
        "segment-anything-2",
        "rasterio",
        "shapely",
        "numpy",
        "fastapi[standard]",
        "Pillow",
    )
    .env({"TORCH_HOME": "/root/.cache/torch"})
)

# ---------------------------------------------------------------------------
# SAM2 model class (GPU-attached)
# ---------------------------------------------------------------------------

@app.cls(
    image=sam2_image,
    gpu="A10G",  # or "T4" for cheaper, "A100" for faster
    timeout=300,
    container_idle_timeout=120,
    allow_concurrent_inputs=4,
)
class SAM2Model:
    """SAM2 segmentation model running on Modal GPU."""

    @modal.enter()
    def load_model(self):
        """Load SAM2 model once when container starts."""
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Try large first, fall back to base_plus
        for ckpt, cfg in [
            ("sam2.1_hiera_large", "configs/sam2.1/sam2.1_hiera_l.yaml"),
            ("sam2.1_hiera_base_plus", "configs/sam2.1/sam2.1_hiera_b+.yaml"),
        ]:
            try:
                self.sam_model = build_sam2(cfg, ckpt, device=device)
                self.model_name = ckpt
                break
            except Exception:
                continue
        
        self.predictor = SAM2ImagePredictor(self.sam_model)
        self.auto_generator = SAM2AutomaticMaskGenerator(
            self.sam_model,
            points_per_side=32,
            pred_iou_thresh=0.7,
            stability_score_thresh=0.8,
        )
        self.device = device
        print(f"✅ SAM2 loaded: {self.model_name} on {device}")

    @modal.method()
    def segment_auto(self, image_bytes: bytes, bbox: list[float] | None = None) -> dict:
        """Auto-segment an image, return GeoJSON FeatureCollection."""
        import numpy as np
        from PIL import Image
        import io

        image = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
        masks = self.auto_generator.generate(image)

        features = []
        h, w = image.shape[:2]
        
        for i, mask_data in enumerate(masks):
            mask = mask_data["segmentation"]
            score = float(mask_data["stability_score"])
            area_pixels = int(mask_data["area"])
            
            # Convert mask to simplified polygon (contour)
            contour = _mask_to_polygon(mask)
            if contour is None:
                continue
            
            # Convert pixel coords to geo coords if bbox provided
            if bbox:
                coords = _pixel_to_geo(contour, w, h, bbox)
            else:
                coords = contour
            
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]},
                "properties": {
                    "id": f"seg_{i}",
                    "confidence": round(score, 3),
                    "area_pixels": area_pixels,
                    "class": "unknown",
                },
            })

        return {
            "type": "FeatureCollection",
            "features": features,
            "_stats": {"count": len(features)},
        }

    @modal.method()
    def segment_point(
        self, image_bytes: bytes, x: int, y: int, label: int = 1, bbox: list[float] | None = None
    ) -> dict:
        """Point-prompt segmentation."""
        import numpy as np
        from PIL import Image
        import io

        image = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
        h, w = image.shape[:2]
        
        self.predictor.set_image(image)
        masks, scores, _ = self.predictor.predict(
            point_coords=np.array([[x, y]]),
            point_labels=np.array([label]),
            multimask_output=True,
        )

        features = []
        for i, (mask, score) in enumerate(zip(masks, scores)):
            contour = _mask_to_polygon(mask)
            if contour is None:
                continue
            coords = _pixel_to_geo(contour, w, h, bbox) if bbox else contour
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]},
                "properties": {
                    "id": f"pt_{i}",
                    "confidence": round(float(score), 3),
                    "class": "unknown",
                },
            })

        return {"type": "FeatureCollection", "features": features}

    @modal.method()
    def segment_box(
        self, image_bytes: bytes, box: list[int], geo_bbox: list[float] | None = None
    ) -> dict:
        """Box-prompt segmentation."""
        import numpy as np
        from PIL import Image
        import io

        image = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
        h, w = image.shape[:2]
        
        self.predictor.set_image(image)
        masks, scores, _ = self.predictor.predict(
            box=np.array(box),
            multimask_output=True,
        )

        features = []
        for i, (mask, score) in enumerate(zip(masks, scores)):
            contour = _mask_to_polygon(mask)
            if contour is None:
                continue
            coords = _pixel_to_geo(contour, w, h, geo_bbox) if geo_bbox else contour
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]},
                "properties": {
                    "id": f"box_{i}",
                    "confidence": round(float(score), 3),
                    "class": "unknown",
                },
            })

        return {"type": "FeatureCollection", "features": features}

    @modal.method()
    def health(self) -> dict:
        return {
            "status": "ok",
            "model": self.model_name,
            "device": str(self.device),
            "backend": "modal",
        }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _mask_to_polygon(mask) -> list[list[float]] | None:
    """Convert binary mask to simplified polygon coordinates."""
    import numpy as np
    
    # Find contours via simple boundary tracing
    coords = np.argwhere(mask)
    if len(coords) < 3:
        return None
    
    from shapely.geometry import MultiPoint
    from shapely.ops import unary_union
    
    # Convex hull as simplified polygon
    points = MultiPoint([(int(c[1]), int(c[0])) for c in coords[::max(1, len(coords)//200)]])
    hull = points.convex_hull
    
    if hull.is_empty or hull.geom_type == "Point":
        return None
    
    exterior = list(hull.exterior.coords) if hull.geom_type == "Polygon" else None
    return [[float(x), float(y)] for x, y in exterior] if exterior else None


def _pixel_to_geo(
    pixel_coords: list[list[float]], w: int, h: int, bbox: list[float]
) -> list[list[float]]:
    """Convert pixel [x, y] to [lng, lat] given image dimensions and geo bbox."""
    min_lng, min_lat, max_lng, max_lat = bbox
    result = []
    for px, py in pixel_coords:
        lng = min_lng + (px / w) * (max_lng - min_lng)
        lat = max_lat - (py / h) * (max_lat - min_lat)  # y-axis inverted
        result.append([round(lng, 7), round(lat, 7)])
    return result


# ---------------------------------------------------------------------------
# FastAPI web endpoint (for modal serve / direct HTTP access)
# ---------------------------------------------------------------------------

@app.function(image=sam2_image)
@modal.asgi_app()
def web_app():
    """Expose SAM2 as a FastAPI web service on Modal."""
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    
    api = FastAPI(title="PalmView SAM2 (Modal)")
    api.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    
    model = SAM2Model()
    
    class PointRequest(BaseModel):
        image_url: str
        x: int
        y: int
        label: int = 1
        bbox: list[float] | None = None
    
    class BoxRequest(BaseModel):
        image_url: str
        box: list[int]
        bbox: list[float] | None = None
    
    class AutoRequest(BaseModel):
        image_url: str
        bbox: list[float] | None = None
    
    @api.get("/health")
    async def health():
        return model.health.remote()
    
    @api.post("/segment/auto")
    async def segment_auto(req: AutoRequest):
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(req.image_url)
            resp.raise_for_status()
        return model.segment_auto.remote(resp.content, req.bbox)
    
    @api.post("/segment/point")
    async def segment_point(req: PointRequest):
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(req.image_url)
            resp.raise_for_status()
        return model.segment_point.remote(resp.content, req.x, req.y, req.label, req.bbox)
    
    @api.post("/segment/box")
    async def segment_box(req: BoxRequest):
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(req.image_url)
            resp.raise_for_status()
        return model.segment_box.remote(resp.content, req.box, req.bbox)
    
    return api

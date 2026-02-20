"""
RemoteCLIP-based semantic search service.

Provides text-to-region and image-to-region search over pre-indexed
satellite tile embeddings using RemoteCLIP (ViT-L-14).
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy imports (heavy deps)
_torch = None
_open_clip = None
_rasterio = None


def _import_deps():
    global _torch, _open_clip, _rasterio
    if _torch is None:
        import torch
        import open_clip
        import rasterio
        _torch = torch
        _open_clip = open_clip
        _rasterio = rasterio


class CLIPSearchService:
    """Manages RemoteCLIP model and tile embedding index for semantic search."""

    def __init__(self):
        self._model = None
        self._preprocess = None
        self._tokenizer = None
        self._device = None
        self._tile_embeddings: np.ndarray | None = None  # [N, D]
        self._tile_metadata: list[dict] = []  # bounds, file, region
        self._index_ready = False

    @property
    def is_ready(self) -> bool:
        return self._index_ready

    def status(self) -> dict[str, Any]:
        return {
            "model_loaded": self._model is not None,
            "index_ready": self._index_ready,
            "num_tiles": len(self._tile_metadata),
            "device": str(self._device) if self._device else None,
            "weights": str(settings.clip_weights_path),
        }

    def _ensure_model(self):
        """Lazy-load RemoteCLIP model."""
        if self._model is not None:
            return

        _import_deps()
        torch = _torch
        open_clip = _open_clip

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading RemoteCLIP ViT-L-14 on %s...", self._device)

        t0 = time.time()
        model, _, preprocess = open_clip.create_model_and_transforms("ViT-L-14")

        weights_path = Path(settings.clip_weights_path)
        if weights_path.exists():
            ckpt = torch.load(str(weights_path), map_location=self._device, weights_only=False)
            model.load_state_dict(ckpt, strict=False)
            logger.info("Loaded RemoteCLIP weights from %s", weights_path)
        else:
            logger.warning("RemoteCLIP weights not found at %s, using OpenAI defaults", weights_path)

        self._model = model.to(self._device).eval()
        self._preprocess = preprocess
        self._tokenizer = open_clip.get_tokenizer("ViT-L-14")
        logger.info("RemoteCLIP loaded in %.1fs", time.time() - t0)

    def _load_tile_rgb(self, path: str) -> np.ndarray | None:
        """Load a GeoTIFF tile as RGB uint8 array."""
        _import_deps()
        rasterio = _rasterio

        try:
            with rasterio.open(path) as src:
                n = min(3, src.count)
                bands = [src.read(i + 1).astype(np.float32) for i in range(n)]
                while len(bands) < 3:
                    bands.append(bands[0])

                def norm(b):
                    valid = b[b > 0]
                    if len(valid) == 0:
                        return np.zeros_like(b, dtype=np.uint8)
                    p2, p98 = np.percentile(valid, [2, 98])
                    return np.clip((b - p2) / (p98 - p2 + 1e-6) * 255, 0, 255).astype(np.uint8)

                rgb = np.stack([norm(b) for b in bands], axis=-1)
                return rgb if rgb.max() > 0 else None
        except Exception as e:
            logger.warning("Failed to load %s: %s", path, e)
            return None

    def build_index(self, data_dir: str | None = None) -> dict[str, Any]:
        """
        Build tile embedding index from GeoTIFF files.
        
        Looks for manifest.json in data_dir, or indexes all .tif files.
        Returns stats about the built index.
        """
        self._ensure_model()
        _import_deps()
        torch = _torch
        from PIL import Image

        if data_dir is None:
            data_dir = str(settings.tile_data_dir)
        
        data_path = Path(data_dir)
        if not data_path.exists():
            return {"error": f"Data directory not found: {data_dir}"}

        # Load manifest if available
        manifest_path = data_path / "manifest.json"
        manifest = None
        if manifest_path.exists():
            with open(manifest_path) as f:
                manifest = json.load(f)

        # Collect tiles
        tif_files = sorted(data_path.glob("*.tif"))
        if not tif_files:
            return {"error": "No .tif files found"}

        logger.info("Building index from %d tiles in %s", len(tif_files), data_dir)
        t0 = time.time()

        images_list = []
        metadata = []

        for tif in tif_files:
            rgb = self._load_tile_rgb(str(tif))
            if rgb is None:
                continue

            # Get bounds from rasterio
            with _rasterio.open(str(tif)) as src:
                bounds = list(src.bounds)  # [left, bottom, right, top]

            pil_img = Image.fromarray(rgb)
            images_list.append(self._preprocess(pil_img))
            metadata.append({
                "file": tif.name,
                "bounds": bounds,  # [west, south, east, north]
                "region": tif.stem.rsplit("_", 1)[0],  # e.g. "kota_tinggi"
            })

        if not images_list:
            return {"error": "No valid tiles found"}

        # Batch encode
        batch_size = 32
        all_embs = []
        for i in range(0, len(images_list), batch_size):
            batch = torch.stack(images_list[i:i + batch_size]).to(self._device)
            with torch.no_grad():
                embs = self._model.encode_image(batch)
                embs = embs / embs.norm(dim=-1, keepdim=True)
                all_embs.append(embs.cpu().numpy())

        self._tile_embeddings = np.concatenate(all_embs, axis=0)  # [N, D]
        self._tile_metadata = metadata
        self._index_ready = True

        elapsed = time.time() - t0
        logger.info("Index built: %d tiles in %.1fs", len(metadata), elapsed)

        return {
            "num_tiles": len(metadata),
            "embedding_dim": self._tile_embeddings.shape[1],
            "build_time_s": round(elapsed, 2),
            "regions": list({m["region"] for m in metadata}),
        }

    def search_text(
        self,
        query: str,
        top_k: int = 10,
        region: str | None = None,
    ) -> dict[str, Any]:
        """
        Search tiles by text query.
        
        Returns ranked list of tile bounding boxes with similarity scores.
        """
        if not self._index_ready:
            return {"error": "Index not built. Call /api/search/build first."}

        self._ensure_model()
        _import_deps()
        torch = _torch

        t0 = time.time()

        # Encode text
        with torch.no_grad():
            tokens = self._tokenizer([query]).to(self._device)
            text_emb = self._model.encode_text(tokens)
            text_emb = text_emb / text_emb.norm(dim=-1, keepdim=True)
            text_emb_np = text_emb.cpu().numpy()  # [1, D]

        # Compute similarities
        similarities = (self._tile_embeddings @ text_emb_np.T).squeeze(-1)  # [N]

        # Filter by region if specified
        if region:
            mask = np.array([m["region"] == region for m in self._tile_metadata])
            if not mask.any():
                return {"error": f"No tiles found for region: {region}"}
            similarities = np.where(mask, similarities, -1.0)

        # Rank
        top_indices = np.argsort(similarities)[::-1][:top_k]

        results = []
        for rank, idx in enumerate(top_indices):
            idx = int(idx)
            meta = self._tile_metadata[idx]
            score = float(similarities[idx])
            if score < 0:
                continue
            results.append({
                "rank": rank + 1,
                "score": round(score, 4),
                "bounds": meta["bounds"],  # [west, south, east, north]
                "region": meta["region"],
                "file": meta["file"],
            })

        elapsed = time.time() - t0

        return {
            "query": query,
            "top_k": top_k,
            "results": results,
            "search_time_ms": round(elapsed * 1000, 1),
            "total_tiles": len(self._tile_metadata),
        }

    def search_multi(
        self,
        queries: list[str],
        top_k: int = 5,
    ) -> dict[str, Any]:
        """Search with multiple text queries simultaneously for comparison."""
        if not self._index_ready:
            return {"error": "Index not built. Call /api/search/build first."}

        self._ensure_model()
        _import_deps()
        torch = _torch

        t0 = time.time()

        with torch.no_grad():
            tokens = self._tokenizer(queries).to(self._device)
            text_embs = self._model.encode_text(tokens)
            text_embs = text_embs / text_embs.norm(dim=-1, keepdim=True)
            text_embs_np = text_embs.cpu().numpy()  # [Q, D]

        # [N, Q] similarity matrix
        sim_matrix = self._tile_embeddings @ text_embs_np.T

        all_results = {}
        for qi, query in enumerate(queries):
            sims = sim_matrix[:, qi]
            top_indices = np.argsort(sims)[::-1][:top_k]
            all_results[query] = [
                {
                    "rank": r + 1,
                    "score": round(float(sims[int(idx)]), 4),
                    "bounds": self._tile_metadata[int(idx)]["bounds"],
                    "region": self._tile_metadata[int(idx)]["region"],
                    "file": self._tile_metadata[int(idx)]["file"],
                }
                for r, idx in enumerate(top_indices)
            ]

        return {
            "queries": queries,
            "results": all_results,
            "search_time_ms": round((time.time() - t0) * 1000, 1),
        }

    def dense_search(
        self,
        query: str,
        tile_file: str,
        tile_size: int = 224,
        stride: int = 112,
        threshold: float = 0.15,
    ) -> dict[str, Any]:
        """
        Dense sub-tile search within a single tile.
        
        Slides a window across the tile, computes CLIP similarity for each patch,
        generates a heatmap, and extracts contour polygons for high-similarity regions.
        
        Returns GeoJSON features for regions exceeding the threshold.
        """
        self._ensure_model()
        _import_deps()
        torch = _torch
        rasterio = _rasterio
        from PIL import Image as PILImage

        t0 = time.time()
        tile_path = Path(settings.tile_data_dir) / tile_file

        if not tile_path.exists():
            return {"error": f"Tile not found: {tile_file}"}

        # Load tile
        rgb = self._load_tile_rgb(str(tile_path))
        if rgb is None:
            return {"error": f"Failed to load tile: {tile_file}"}

        with rasterio.open(str(tile_path)) as src:
            transform = list(src.transform)[:6]
            bounds = list(src.bounds)

        h, w, _ = rgb.shape

        # Encode text query
        with torch.no_grad():
            tokens = self._tokenizer([query]).to(self._device)
            text_emb = self._model.encode_text(tokens)
            text_emb = text_emb / text_emb.norm(dim=-1, keepdim=True)

        # Sliding window
        patches = []
        positions = []  # (x, y) pixel positions
        for y in range(0, h - tile_size + 1, stride):
            for x in range(0, w - tile_size + 1, stride):
                patch = rgb[y:y + tile_size, x:x + tile_size]
                patches.append(self._preprocess(PILImage.fromarray(patch)))
                positions.append((x, y))

        if not patches:
            return {"error": "Tile too small for sliding window"}

        # Batch encode patches
        batch_size = 32
        all_embs = []
        for i in range(0, len(patches), batch_size):
            batch = torch.stack(patches[i:i + batch_size]).to(self._device)
            with torch.no_grad():
                embs = self._model.encode_image(batch)
                embs = embs / embs.norm(dim=-1, keepdim=True)
                all_embs.append(embs.cpu())

        all_embs = torch.cat(all_embs, dim=0)
        similarities = (all_embs @ text_emb.cpu().T).squeeze(-1).numpy()

        # Build spatial heatmap
        heatmap = np.zeros((h, w), dtype=np.float32)
        counts = np.zeros((h, w), dtype=np.float32)

        for idx, (x, y) in enumerate(positions):
            heatmap[y:y + tile_size, x:x + tile_size] += similarities[idx]
            counts[y:y + tile_size, x:x + tile_size] += 1.0

        counts[counts == 0] = 1.0
        heatmap /= counts  # average overlapping regions

        # Convert pixel coords to geo coords
        def pixel_to_geo(px, py):
            lon = transform[0] * px + transform[1] * py + transform[2]
            lat = transform[3] * px + transform[4] * py + transform[5]
            return round(lon, 7), round(lat, 7)

        # Threshold and extract contours
        import cv2
        binary = (heatmap > threshold).astype(np.uint8) * 255
        # Morphological cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        features = []
        for ci, contour in enumerate(contours):
            area_px = cv2.contourArea(contour)
            if area_px < 100:  # Skip tiny fragments
                continue

            # Simplify contour
            epsilon = 0.01 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)

            if len(approx) < 3:
                continue

            # Convert to geo coordinates
            coords = []
            for pt in approx:
                px, py = pt[0]
                lon, lat = pixel_to_geo(float(px), float(py))
                coords.append([lon, lat])
            coords.append(coords[0])  # close ring

            # Region score = mean similarity in the contour area
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.drawContours(mask, [contour], -1, 255, -1)
            region_score = float(heatmap[mask > 0].mean())

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords],
                },
                "properties": {
                    "score": round(region_score, 4),
                    "area_pixels": int(area_px),
                    "contour_index": ci,
                },
            })

        # Sort by score descending
        features.sort(key=lambda f: f["properties"]["score"], reverse=True)

        elapsed = time.time() - t0

        # Also return heatmap stats
        return {
            "query": query,
            "tile_file": tile_file,
            "tile_bounds": bounds,
            "features": features,
            "num_features": len(features),
            "num_patches": len(patches),
            "heatmap_stats": {
                "min": round(float(heatmap.min()), 4),
                "max": round(float(heatmap.max()), 4),
                "mean": round(float(heatmap.mean()), 4),
                "threshold": threshold,
            },
            "search_time_ms": round(elapsed * 1000, 1),
        }

    def dense_search_heatmap_png(
        self,
        query: str,
        tile_file: str,
        tile_size: int = 224,
        stride: int = 112,
    ) -> bytes | None:
        """Generate a heatmap PNG overlay for a tile + query."""
        self._ensure_model()
        _import_deps()
        torch = _torch
        rasterio = _rasterio
        from PIL import Image as PILImage
        import io

        tile_path = Path(settings.tile_data_dir) / tile_file
        if not tile_path.exists():
            return None

        rgb = self._load_tile_rgb(str(tile_path))
        if rgb is None:
            return None

        h, w, _ = rgb.shape

        # Encode text
        with torch.no_grad():
            tokens = self._tokenizer([query]).to(self._device)
            text_emb = self._model.encode_text(tokens)
            text_emb = text_emb / text_emb.norm(dim=-1, keepdim=True)

        # Sliding window encode
        patches = []
        positions = []
        for y in range(0, h - tile_size + 1, stride):
            for x in range(0, w - tile_size + 1, stride):
                patch = rgb[y:y + tile_size, x:x + tile_size]
                patches.append(self._preprocess(PILImage.fromarray(patch)))
                positions.append((x, y))

        if not patches:
            return None

        batch_size = 32
        all_embs = []
        for i in range(0, len(patches), batch_size):
            batch = torch.stack(patches[i:i + batch_size]).to(self._device)
            with torch.no_grad():
                embs = self._model.encode_image(batch)
                embs = embs / embs.norm(dim=-1, keepdim=True)
                all_embs.append(embs.cpu())

        all_embs = torch.cat(all_embs, dim=0)
        sims = (all_embs @ text_emb.cpu().T).squeeze(-1).numpy()

        # Build heatmap
        heatmap = np.zeros((h, w), dtype=np.float32)
        counts = np.zeros((h, w), dtype=np.float32)
        for idx, (x, y) in enumerate(positions):
            heatmap[y:y + tile_size, x:x + tile_size] += sims[idx]
            counts[y:y + tile_size, x:x + tile_size] += 1.0
        counts[counts == 0] = 1.0
        heatmap /= counts

        # Normalize to 0-255
        hmin, hmax = heatmap.min(), heatmap.max()
        if hmax > hmin:
            norm = ((heatmap - hmin) / (hmax - hmin) * 255).astype(np.uint8)
        else:
            norm = np.zeros_like(heatmap, dtype=np.uint8)

        # Apply colormap: low=transparent, high=green
        import cv2
        colored = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
        colored = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)

        # Create RGBA with alpha proportional to score
        alpha = np.where(norm > 50, np.clip(norm.astype(np.float32) * 0.7, 0, 180), 0).astype(np.uint8)
        rgba = np.dstack([colored, alpha])

        img = PILImage.fromarray(rgba, "RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()


# Singleton
clip_search_service = CLIPSearchService()

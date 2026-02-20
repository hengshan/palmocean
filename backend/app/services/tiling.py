"""
Phase 11: Image tiling service — generates XYZ tiles from uploaded imagery.

Uses GDAL (via rasterio/rio-cogeo) to convert uploads to Cloud Optimized GeoTIFF,
then serves tiles via a lightweight endpoint. Falls back to PIL-based tiling for
non-georeferenced images.
"""

import os
import math
import hashlib
import logging
from pathlib import Path
from io import BytesIO

from app.config import settings

logger = logging.getLogger(__name__)

TILE_SIZE = 256
TILE_CACHE_DIR = os.path.join(settings.upload_dir, "tiles")
os.makedirs(TILE_CACHE_DIR, exist_ok=True)


def _tile_cache_path(image_id: str, z: int, x: int, y: int) -> str:
    """Get the filesystem path for a cached tile."""
    d = os.path.join(TILE_CACHE_DIR, image_id, str(z), str(x))
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{y}.png")


def get_tile(image_path: str, image_id: str, z: int, x: int, y: int) -> bytes | None:
    """
    Generate or retrieve a cached tile for the given image at z/x/y.
    Returns PNG bytes or None if tile is outside image bounds.
    """
    cache_path = _tile_cache_path(image_id, z, x, y)
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return f.read()

    tile_bytes = _render_tile(image_path, z, x, y)
    if tile_bytes:
        with open(cache_path, "wb") as f:
            f.write(tile_bytes)
    return tile_bytes


def _render_tile(image_path: str, z: int, x: int, y: int) -> bytes | None:
    """Render a single tile from the source image."""
    ext = Path(image_path).suffix.lower()

    if ext in (".tif", ".tiff"):
        return _render_tile_rasterio(image_path, z, x, y)
    else:
        return _render_tile_pil(image_path, z, x, y)


def _tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Convert XYZ tile to lon/lat bounds (Web Mercator)."""
    n = 2 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_min, lat_min, lon_max, lat_max


def _render_tile_rasterio(image_path: str, z: int, x: int, y: int) -> bytes | None:
    """Render tile from a GeoTIFF using rasterio."""
    try:
        import rasterio
        from rasterio.warp import transform_bounds
        from rasterio.windows import from_bounds
        from PIL import Image
        import numpy as np

        tile_lon_min, tile_lat_min, tile_lon_max, tile_lat_max = _tile_bounds(z, x, y)

        with rasterio.open(image_path) as ds:
            if not ds.crs:
                return _render_tile_pil(image_path, z, x, y)

            # Transform tile bounds to image CRS
            try:
                img_bounds = transform_bounds("EPSG:4326", ds.crs, tile_lon_min, tile_lat_min, tile_lon_max, tile_lat_max)
            except Exception:
                return None

            # Check if tile intersects image
            ds_bounds = ds.bounds
            if (img_bounds[0] >= ds_bounds.right or img_bounds[2] <= ds_bounds.left or
                img_bounds[1] >= ds_bounds.top or img_bounds[3] <= ds_bounds.bottom):
                return None

            # Read window with boundless=True so out-of-image areas are filled with 0
            # This prevents rasterio from clipping the window and stretching the image
            num_bands = min(ds.count, 3)
            window = from_bounds(*img_bounds, transform=ds.transform)
            data = ds.read(
                window=window,
                out_shape=(num_bands, TILE_SIZE, TILE_SIZE),
                resampling=rasterio.enums.Resampling.bilinear,
                boundless=True,
                fill_value=0,
            )

            # Convert to RGBA PNG (alpha=0 where no data)
            if data.shape[0] >= 3:
                rgb = np.stack([data[0], data[1], data[2]], axis=-1)
            elif data.shape[0] == 1:
                rgb = np.stack([data[0], data[0], data[0]], axis=-1)
            else:
                return None

            # Normalize to 0-255
            if rgb.dtype != np.uint8:
                valid_mask = np.any(rgb > 0, axis=-1)
                if valid_mask.any():
                    vmin, vmax = np.percentile(rgb[valid_mask], [2, 98])
                else:
                    vmin, vmax = 0, 1
                if vmax <= vmin:
                    vmax = vmin + 1
                rgb = np.clip((rgb.astype(float) - vmin) / (vmax - vmin) * 255, 0, 255).astype(np.uint8)
            else:
                valid_mask = np.any(rgb > 0, axis=-1)

            # Create alpha channel: transparent where all bands are 0
            alpha = (valid_mask.astype(np.uint8) * 255)
            rgba = np.concatenate([rgb, alpha[..., np.newaxis]], axis=-1)

            img = Image.fromarray(rgba, "RGBA")
            buf = BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()

    except ImportError:
        logger.warning("rasterio not available, falling back to PIL tiling")
        return _render_tile_pil(image_path, z, x, y)
    except Exception as e:
        logger.error(f"Rasterio tile render failed: {e}")
        return None


def _render_tile_pil(image_path: str, z: int, x: int, y: int) -> bytes | None:
    """Simple tile rendering for non-georeferenced images using PIL."""
    try:
        from PIL import Image

        img = Image.open(image_path)
        w, h = img.size

        # For non-geo images: treat pixel space as tile space
        # Each zoom level doubles resolution
        scale = 2 ** z
        tile_w = w / scale
        tile_h = h / scale

        left = x * tile_w
        top = y * tile_h
        right = left + tile_w
        bottom = top + tile_h

        if left >= w or top >= h or right <= 0 or bottom <= 0:
            return None

        # Clamp
        left = max(0, left)
        top = max(0, top)
        right = min(w, right)
        bottom = min(h, bottom)

        crop = img.crop((int(left), int(top), int(right), int(bottom)))
        tile = crop.resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)

        if tile.mode != "RGB":
            tile = tile.convert("RGB")

        buf = BytesIO()
        tile.save(buf, format="PNG")
        return buf.getvalue()

    except Exception as e:
        logger.error(f"PIL tile render failed: {e}")
        return None


def clear_tile_cache(image_id: str) -> None:
    """Remove cached tiles for an image."""
    import shutil
    cache_dir = os.path.join(TILE_CACHE_DIR, image_id)
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)

"""Google Earth Engine service with lazy initialization."""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Common GEE collections
COMMON_COLLECTIONS = [
    {
        "id": "COPERNICUS/S2_SR_HARMONIZED",
        "name": "Sentinel-2 Surface Reflectance (Harmonized)",
        "description": "Sentinel-2 MSI L2A, atmospherically corrected, harmonized across processing baselines",
        "spatial_resolution": 10,
        "temporal_resolution": "5 days",
        "bands": ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B11", "B12"],
        "default_vis": {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000},
    },
    {
        "id": "LANDSAT/LC09/C02/T1_L2",
        "name": "Landsat 9 Collection 2 Tier 1 Level 2",
        "description": "Landsat 9 OLI-2/TIRS-2 surface reflectance and surface temperature",
        "spatial_resolution": 30,
        "temporal_resolution": "16 days",
        "bands": ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"],
        "default_vis": {"bands": ["SR_B4", "SR_B3", "SR_B2"], "min": 7000, "max": 30000},
    },
    {
        "id": "LANDSAT/LC08/C02/T1_L2",
        "name": "Landsat 8 Collection 2 Tier 1 Level 2",
        "description": "Landsat 8 OLI/TIRS surface reflectance and surface temperature",
        "spatial_resolution": 30,
        "temporal_resolution": "16 days",
        "bands": ["SR_B1", "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"],
        "default_vis": {"bands": ["SR_B4", "SR_B3", "SR_B2"], "min": 7000, "max": 30000},
    },
    {
        "id": "MODIS/061/MOD13A2",
        "name": "MODIS Vegetation Indices (16-day, 1km)",
        "description": "MOD13A2 v061 NDVI and EVI vegetation indices",
        "spatial_resolution": 1000,
        "temporal_resolution": "16 days",
        "bands": ["NDVI", "EVI"],
        "default_vis": {"bands": ["NDVI"], "min": 0, "max": 9000, "palette": ["brown", "yellow", "green"]},
    },
    {
        "id": "COPERNICUS/S1_GRD",
        "name": "Sentinel-1 SAR GRD",
        "description": "Sentinel-1 C-band SAR Ground Range Detected",
        "spatial_resolution": 10,
        "temporal_resolution": "6 days",
        "bands": ["VV", "VH"],
        "default_vis": {"bands": ["VV"], "min": -25, "max": 0},
    },
]

# Index formulas keyed by collection prefix
INDEX_FORMULAS = {
    "ndvi": {
        "COPERNICUS/S2": ("B8", "B4"),
        "LANDSAT/LC08": ("SR_B5", "SR_B4"),
        "LANDSAT/LC09": ("SR_B5", "SR_B4"),
    },
    "ndwi": {
        "COPERNICUS/S2": ("B3", "B8"),
        "LANDSAT/LC08": ("SR_B3", "SR_B5"),
        "LANDSAT/LC09": ("SR_B3", "SR_B5"),
    },
    "ndbi": {
        "COPERNICUS/S2": ("B11", "B8"),
        "LANDSAT/LC08": ("SR_B6", "SR_B5"),
        "LANDSAT/LC09": ("SR_B6", "SR_B5"),
    },
    "evi": {
        "COPERNICUS/S2": ("B8", "B4", "B2"),  # NIR, RED, BLUE
        "LANDSAT/LC08": ("SR_B5", "SR_B4", "SR_B2"),
        "LANDSAT/LC09": ("SR_B5", "SR_B4", "SR_B2"),
    },
}


class GEEService:
    """Google Earth Engine service with lazy initialization."""

    def __init__(self) -> None:
        self._initialized = False
        self._ee = None

    def _ensure_init(self) -> None:
        """Lazy-initialize GEE. Raises RuntimeError if not configured."""
        if self._initialized:
            return

        import ee

        self._ee = ee

        if settings.gee_service_account_email and settings.gee_service_account_key_file:
            credentials = ee.ServiceAccountCredentials(
                settings.gee_service_account_email,
                settings.gee_service_account_key_file,
            )
            ee.Initialize(credentials, project=settings.gee_project or None)
            self._initialized = True
            logger.info("GEE initialized with service account")
        elif settings.gee_project:
            try:
                ee.Initialize(project=settings.gee_project)
                self._initialized = True
                logger.info("GEE initialized with default credentials")
            except Exception as exc:
                raise RuntimeError(
                    "GEE not configured. Set GEO_GEE_SERVICE_ACCOUNT_EMAIL and "
                    "GEO_GEE_SERVICE_ACCOUNT_KEY_FILE, or authenticate via `earthengine authenticate`."
                ) from exc
        else:
            raise RuntimeError(
                "GEE not configured. Set GEO_GEE_PROJECT and optionally "
                "GEO_GEE_SERVICE_ACCOUNT_EMAIL + GEO_GEE_SERVICE_ACCOUNT_KEY_FILE."
            )

    @property
    def ee(self):
        self._ensure_init()
        return self._ee

    def status(self) -> dict[str, Any]:
        """Check GEE connection status."""
        if not settings.gee_service_account_email and not settings.gee_project:
            return {"status": "not_configured", "message": "GEE credentials not set. Set GEO_GEE_PROJECT env var."}
        try:
            self._ensure_init()
            return {"status": "connected", "project": settings.gee_project}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_collections(self) -> list[dict]:
        """Return list of commonly used GEE collections."""
        return COMMON_COLLECTIONS

    def search_collection(
        self,
        collection_id: str,
        bbox: list[float],
        date_range: tuple[str, str],
        limit: int = 20,
        cloud_cover_max: float | None = None,
    ) -> list[dict[str, Any]]:
        """Search a GEE image collection."""
        ee = self.ee
        geometry = ee.Geometry.Rectangle(bbox)
        col = (
            ee.ImageCollection(collection_id)
            .filterBounds(geometry)
            .filterDate(date_range[0], date_range[1])
        )

        if cloud_cover_max is not None:
            # Different property names per collection
            if "S2" in collection_id:
                col = col.filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", cloud_cover_max))
            elif "LANDSAT" in collection_id:
                col = col.filter(ee.Filter.lte("CLOUD_COVER", cloud_cover_max))

        col = col.sort("system:time_start", False).limit(limit)
        info = col.getInfo()

        results = []
        for feat in info.get("features", []):
            props = feat.get("properties", {})
            img_id = feat.get("id", "")
            ts = props.get("system:time_start", 0)
            results.append({
                "id": img_id,
                "datetime": ts,
                "bands": [b["id"] for b in feat.get("bands", [])],
                "properties": {
                    k: v for k, v in props.items()
                    if not k.startswith("system:") or k == "system:time_start"
                },
            })
        return results

    def get_image_info(self, image_id: str) -> dict[str, Any]:
        """Get detailed metadata for a GEE image."""
        ee = self.ee
        img = ee.Image(image_id)
        info = img.getInfo()
        if not info:
            raise ValueError(f"Image not found: {image_id}")
        return {
            "id": info.get("id"),
            "type": info.get("type"),
            "bands": [{"id": b["id"], "data_type": b.get("data_type", {}).get("type"), "dimensions": b.get("dimensions")} for b in info.get("bands", [])],
            "properties": info.get("properties", {}),
        }

    def get_thumbnail(
        self,
        image_id: str,
        bbox: list[float] | None = None,
        bands: list[str] | None = None,
        vis_min: float = 0,
        vis_max: float = 3000,
        dimensions: int = 512,
    ) -> str:
        """Generate a thumbnail URL for a GEE image."""
        ee = self.ee
        img = ee.Image(image_id)

        vis_params: dict[str, Any] = {"dimensions": dimensions, "min": vis_min, "max": vis_max, "format": "png"}
        if bands:
            vis_params["bands"] = bands
            img = img.select(bands)
        if bbox:
            vis_params["region"] = ee.Geometry.Rectangle(bbox)

        return img.getThumbURL(vis_params)

    def export_region(
        self,
        image_id: str,
        bbox: list[float],
        scale: int = 10,
        bands: list[str] | None = None,
    ) -> str:
        """Export a region as GeoTIFF via getDownloadURL (small regions)."""
        ee = self.ee
        img = ee.Image(image_id)
        if bands:
            img = img.select(bands)

        region = ee.Geometry.Rectangle(bbox)
        url = img.getDownloadURL({
            "scale": scale,
            "region": region,
            "format": "GEO_TIFF",
            "crs": "EPSG:4326",
        })
        return url

    def compute_index(
        self,
        image_id: str,
        index_type: str,
        bbox: list[float] | None = None,
        dimensions: int = 512,
    ) -> dict[str, Any]:
        """Compute a spectral index and return a thumbnail URL."""
        ee = self.ee
        index_type = index_type.lower()
        if index_type not in INDEX_FORMULAS:
            raise ValueError(f"Unknown index: {index_type}. Supported: {list(INDEX_FORMULAS.keys())}")

        formulas = INDEX_FORMULAS[index_type]
        # Find matching collection prefix
        band_names = None
        for prefix, bands_tuple in formulas.items():
            if image_id.startswith(prefix):
                band_names = bands_tuple
                break
        if not band_names:
            raise ValueError(f"Index {index_type} not supported for collection of image {image_id}")

        img = ee.Image(image_id)

        if index_type == "evi":
            nir, red, blue = band_names
            index_img = img.expression(
                "2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))",
                {"NIR": img.select(nir), "RED": img.select(red), "BLUE": img.select(blue)},
            ).rename("EVI")
        else:
            b1, b2 = band_names
            index_img = img.normalizedDifference([b1, b2]).rename(index_type.upper())

        vis_params: dict[str, Any] = {
            "min": -1, "max": 1,
            "palette": ["red", "yellow", "green"],
            "dimensions": dimensions,
            "format": "png",
        }
        if bbox:
            vis_params["region"] = ee.Geometry.Rectangle(bbox)

        return {
            "index": index_type,
            "thumbnail_url": index_img.getThumbURL(vis_params),
        }


gee_service = GEEService()

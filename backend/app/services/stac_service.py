"""Unified STAC service for multiple providers."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from pystac_client import Client

from app.config import settings

logger = logging.getLogger(__name__)

PROVIDER_URLS = {
    "planetary-computer": lambda: settings.stac_planetary_computer_url,
    "earth-search": lambda: settings.stac_earth_search_url,
    "copernicus": lambda: settings.stac_copernicus_url,
}

PROVIDER_INFO = {
    "planetary-computer": {
        "name": "Microsoft Planetary Computer",
        "url": settings.stac_planetary_computer_url,
        "requires_auth": False,
        "popular_collections": ["sentinel-2-l2a", "landsat-c2-l2", "naip", "cop-dem-glo-30", "3dep-lidar-copc"],
    },
    "earth-search": {
        "name": "Element84 Earth Search",
        "url": settings.stac_earth_search_url,
        "requires_auth": False,
        "popular_collections": ["sentinel-2-l2a", "sentinel-2-c1-l2a", "landsat-c2-l2", "cop-dem-glo-30"],
    },
    "copernicus": {
        "name": "Copernicus Data Space",
        "url": settings.stac_copernicus_url,
        "requires_auth": True,
        "popular_collections": ["SENTINEL-2", "SENTINEL-1"],
    },
}


def _get_client(provider: str) -> Client:
    """Open a STAC client for the given provider."""
    if provider not in PROVIDER_URLS:
        raise ValueError(f"Unknown provider: {provider}. Available: {list(PROVIDER_URLS.keys())}")

    url = PROVIDER_URLS[provider]()
    kwargs: dict[str, Any] = {}

    if provider == "planetary-computer":
        try:
            import planetary_computer
            kwargs["modifier"] = planetary_computer.sign_inplace
        except ImportError:
            logger.warning("planetary-computer package not installed, URLs won't be signed")

    return Client.open(url, **kwargs)


def _standardize_item(item: Any) -> dict[str, Any]:
    """Convert a STAC item to a standardized dict."""
    props = item.properties or {}
    assets = {}
    for key, asset in (item.assets or {}).items():
        assets[key] = {
            "href": asset.href,
            "type": getattr(asset, "media_type", None) or asset.extra_fields.get("type"),
            "title": asset.title,
        }

    # Try to find thumbnail
    thumbnail = None
    if "thumbnail" in assets:
        thumbnail = assets["thumbnail"]["href"]
    elif "rendered_preview" in assets:
        thumbnail = assets["rendered_preview"]["href"]

    return {
        "id": item.id,
        "datetime": props.get("datetime"),
        "bbox": list(item.bbox) if item.bbox else None,
        "cloud_cover": props.get("eo:cloud_cover"),
        "thumbnail": thumbnail,
        "assets": assets,
        "properties": {k: v for k, v in props.items() if k not in ("datetime",)},
    }


class STACService:
    """Unified STAC search service."""

    def get_providers(self) -> dict[str, Any]:
        """List configured STAC providers."""
        return PROVIDER_INFO

    def get_collections(self, provider: str, limit: int = 50) -> list[dict[str, Any]]:
        """List collections for a provider."""
        client = _get_client(provider)
        results = []
        for i, col in enumerate(client.get_collections()):
            if i >= limit:
                break
            results.append({
                "id": col.id,
                "title": col.title,
                "description": col.description,
                "extent": col.extent.to_dict() if col.extent else None,
                "license": col.license,
            })
        return results

    def search(
        self,
        provider: str,
        collection: str,
        bbox: list[float] | None = None,
        datetime: str | None = None,
        limit: int = 20,
        query: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Search a STAC provider."""
        client = _get_client(provider)
        search_kwargs: dict[str, Any] = {
            "collections": [collection],
            "max_items": limit,
        }
        if bbox:
            search_kwargs["bbox"] = bbox
        if datetime:
            search_kwargs["datetime"] = datetime
        if query:
            search_kwargs["query"] = query

        search = client.search(**search_kwargs)
        return [_standardize_item(item) for item in search.items()]

    def get_item(self, provider: str, collection: str, item_id: str) -> dict[str, Any]:
        """Get a specific STAC item."""
        client = _get_client(provider)
        col = client.get_collection(collection)
        # Search for specific item
        search = client.search(collections=[collection], ids=[item_id], max_items=1)
        items = list(search.items())
        if not items:
            raise ValueError(f"Item not found: {item_id} in {collection}")
        return _standardize_item(items[0])

    async def download_asset(
        self,
        provider: str,
        collection: str,
        item_id: str,
        asset_key: str,
        output_dir: str,
    ) -> str:
        """Download a specific asset. Returns the local file path."""
        import os

        item_data = self.get_item(provider, collection, item_id)
        if asset_key not in item_data["assets"]:
            raise ValueError(f"Asset '{asset_key}' not found. Available: {list(item_data['assets'].keys())}")

        href = item_data["assets"][asset_key]["href"]
        os.makedirs(output_dir, exist_ok=True)

        filename = href.split("/")[-1].split("?")[0]
        output_path = os.path.join(output_dir, filename)

        async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
            resp = await client.get(href)
            resp.raise_for_status()
            with open(output_path, "wb") as f:
                f.write(resp.content)

        return output_path

    def get_tile_url(
        self,
        provider: str,
        collection: str,
        item_id: str,
        asset_key: str,
        rescale: str = "0,3000",
        bidx: str | None = None,
    ) -> dict[str, str]:
        """Get a TiTiler XYZ tile URL for a COG asset.

        Returns a tile_url in the form:
          http://<titiler>/cog/tiles/{z}/{x}/{y}.png?url=<COG_URL>&rescale=0,3000&...

        The frontend detects {z}/{x}/{y} in the URL and renders it as a raster
        tile source automatically.
        """
        import os
        item_data = self.get_item(provider, collection, item_id)
        if asset_key not in item_data["assets"]:
            raise ValueError(f"Asset '{asset_key}' not found. Available: {list(item_data['assets'].keys())}")

        href = item_data["assets"][asset_key]["href"]
        asset_type = item_data["assets"][asset_key].get("type", "")

        # Auto-select rescale range based on asset type:
        # - visual / rendered_preview / TCI = UINT8 (already 0-255, display-ready)
        # - raw spectral bands (B02/B03/B04 etc.) = UInt16 reflectance (0-10000)
        # Applying rescale=0,3000 to a UINT8 TCI makes all pixels appear nearly black.
        if rescale == "0,3000" and asset_key in ("visual", "rendered_preview", "tilejson"):
            rescale = "0,255"

        # Build TiTiler COG tile URL.
        # IMPORTANT: URL-encode the COG href so that any embedded query params
        # (SAS tokens contain ?sv=...&se=...&sig=... characters) are not split by
        # TiTiler's query parser — without this, the SAS token is truncated and
        # Planetary Computer returns HTTP 409 (access denied).
        from urllib.parse import quote as _quote
        titiler_base = os.environ.get("TITILER_BASE_URL", "http://localhost:8003")
        encoded_href = _quote(href, safe="")
        params = f"url={encoded_href}&rescale={rescale}&return_mask=true"
        if bidx:
            params += f"&bidx={bidx}"
        # TiTiler 1.x requires TileMatrixSet in path: /cog/tiles/{TileMatrixSetId}/{z}/{x}/{y}
        tile_url = f"{titiler_base}/cog/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}.png?{params}"

        return {
            "tile_url": tile_url,
            "url": href,
            "type": asset_type,
            "provider": provider,
            "titiler_base": titiler_base,
            "rescale": rescale,
        }


stac_service = STACService()

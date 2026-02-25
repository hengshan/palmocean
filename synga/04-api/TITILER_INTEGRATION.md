# TiTiler Integration Guide

## Overview

PalmView uses [TiTiler](https://developmentseed.org/titiler/) as a COG (Cloud-Optimized GeoTIFF) tile server to stream full-resolution Sentinel-2 and other raster imagery as XYZ tiles directly to the map.

Before this integration, STAC data was loaded via thumbnail previews (low quality). Now the `GET /stac/{provider}/{collection}/{item_id}/tile-url` endpoint returns a TiTiler XYZ URL that the frontend renders as a native raster tile layer.

## Architecture

```
STAC API (Planetary Computer / local)
        ↓  COG HTTPS href
FastAPI backend (port 8000)
        ↓  XYZ tile URL
TiTiler (port 8003)  ←──── reads COG on-demand (HTTP range requests)
        ↓  PNG tiles
MapLibre GL raster layer (frontend)
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| palmview-api | 8000 | FastAPI backend |
| palmview-titiler | 8003 | TiTiler COG tile server |

## Setup

### Install

```bash
python3 -m venv ~/envs/titiler
~/envs/titiler/bin/pip install "titiler.application" uvicorn
```

### Systemd (user-level)

```bash
cp deploy/systemd/palmview-titiler.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now palmview-titiler
```

### Health check

```bash
curl http://localhost:8003/healthz
# → {"versions":{"titiler":"1.2.0","rasterio":"1.5.0","gdal":"3.12.1",...}}
```

### Environment variable

Add to `backend/.env`:
```
TITILER_BASE_URL=http://localhost:8003
```

For Tailscale remote access, set to the szls Tailscale address:
```
TITILER_BASE_URL=http://szls.taila366a3.ts.net:8003
```

## API

### GET /stac/{provider}/{collection}/{item_id}/tile-url

Returns a TiTiler XYZ tile URL for streaming COG raster tiles.

**Query parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `asset_key` | required | STAC asset key (e.g. `visual`, `B04`, `red`) |
| `rescale` | `0,3000` | Min,max pixel range for rendering (Sentinel-2 L2A typical) |
| `bidx` | none | Band indices for RGB composite (e.g. `3,2,1`) |

**Response:**
```json
{
  "tile_url": "http://localhost:8003/cog/tiles/{z}/{x}/{y}.png?url=https://...&rescale=0,3000&return_mask=true",
  "url": "https://...original-cog-href...",
  "type": "image/tiff; application=geotiff; profile=cloud-optimized",
  "provider": "planetary-computer",
  "titiler_base": "http://localhost:8003",
  "rescale": "0,3000"
}
```

The frontend detects `{z}/{x}/{y}` in `tile_url` and automatically renders it as a Mapbox/MapLibre raster tile source.

## Rendering Notes

- **Sentinel-2 L2A**: default `rescale=0,3000` works well for true-color (B4/B3/B2)
- **Sentinel-2 L1C**: try `rescale=0,10000`
- **RGB composite**: use `bidx=3,2,1` to map B4→R, B3→G, B2→B in a multi-band COG
- **Single band (NDVI etc.)**: omit `bidx`, add `colormap_name=rdylgn` via direct TiTiler URL

## MinIO-hosted COGs

To serve local COGs stored in MinIO:

```bash
# Set env before starting TiTiler
export AWS_ENDPOINT_URL=http://localhost:9000
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
```

The systemd service includes `GDAL_HTTP_UNSAFESSL=YES` for http:// MinIO endpoints.

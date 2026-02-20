"""STAC data routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


def _get_service():
    from app.services.stac_service import stac_service
    return stac_service


@router.get("/providers")
def stac_providers():
    return _get_service().get_providers()


@router.get("/{provider}/collections")
def stac_collections(provider: str, limit: int = Query(50, ge=1, le=200)):
    try:
        return _get_service().get_collections(provider, limit)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error fetching collections: {e}")


@router.get("/{provider}/search")
def stac_search(
    provider: str,
    collection: str = Query(...),
    bbox: str | None = Query(None, description="west,south,east,north"),
    datetime: str | None = Query(None, description="e.g. 2024-01-01/2024-12-31"),
    limit: int = Query(20, ge=1, le=100),
):
    bbox_list = None
    if bbox:
        try:
            bbox_list = [float(x) for x in bbox.split(",")]
            if len(bbox_list) != 4:
                raise ValueError
        except ValueError:
            raise HTTPException(400, "bbox must be 4 comma-separated floats")

    try:
        return _get_service().search(provider, collection, bbox_list, datetime, limit)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"STAC search error: {e}")


@router.get("/{provider}/{collection}/{item_id}")
def stac_item(provider: str, collection: str, item_id: str):
    try:
        return _get_service().get_item(provider, collection, item_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error fetching item: {e}")


class DownloadRequest(BaseModel):
    asset_key: str
    output_dir: str = "/tmp/stac_downloads"


@router.post("/{provider}/{collection}/{item_id}/download")
async def stac_download(provider: str, collection: str, item_id: str, req: DownloadRequest):
    try:
        import os
        path = await _get_service().download_asset(provider, collection, item_id, req.asset_key, req.output_dir)
        # Upload to MinIO
        from app.services.minio_service import upload_file, get_presigned_url
        object_name = f"stac/{provider}/{collection}/{item_id}/{os.path.basename(path)}"
        minio_url = upload_file(path, object_name, content_type="image/tiff")
        download_url = get_presigned_url(object_name)
        # Clean up local file
        os.remove(path)
        return {"downloaded": path, "minio_url": minio_url, "download_url": download_url, "object_name": object_name}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Download error: {e}")


@router.get("/{provider}/{collection}/{item_id}/tile-url")
def stac_tile_url(
    provider: str, collection: str, item_id: str,
    asset_key: str = Query(...),
):
    try:
        return _get_service().get_tile_url(provider, collection, item_id, asset_key)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error: {e}")

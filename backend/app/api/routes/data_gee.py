"""GEE data routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


def _get_service():
    from app.services.gee_service import gee_service
    return gee_service


@router.get("/status")
def gee_status():
    return _get_service().status()


@router.get("/collections")
def gee_collections():
    return _get_service().get_collections()


@router.get("/search")
def gee_search(
    collection: str = Query(..., description="GEE collection ID"),
    bbox: str = Query(..., description="west,south,east,north"),
    date_start: str = Query(...),
    date_end: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    cloud_cover_max: float | None = Query(None, ge=0, le=100),
):
    try:
        bbox_list = [float(x) for x in bbox.split(",")]
        if len(bbox_list) != 4:
            raise ValueError
    except ValueError:
        raise HTTPException(400, "bbox must be 4 comma-separated floats: west,south,east,north")

    try:
        return _get_service().search_collection(
            collection, bbox_list, (date_start, date_end), limit, cloud_cover_max
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/image/{image_id:path}/info")
def gee_image_info(image_id: str):
    try:
        return _get_service().get_image_info(image_id)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/image/{image_id:path}/thumbnail")
def gee_image_thumbnail(
    image_id: str,
    bbox: str | None = Query(None),
    bands: str | None = Query(None, description="Comma-separated band names"),
    min: float = Query(0),
    max: float = Query(3000),
    dimensions: int = Query(512),
):
    bbox_list = None
    if bbox:
        try:
            bbox_list = [float(x) for x in bbox.split(",")]
        except ValueError:
            raise HTTPException(400, "Invalid bbox")

    bands_list = bands.split(",") if bands else None

    try:
        url = _get_service().get_thumbnail(image_id, bbox_list, bands_list, min, max, dimensions)
        return {"thumbnail_url": url}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


class ExportRequest(BaseModel):
    bbox: str
    scale: int = 10
    bands: list[str] | None = None


@router.post("/image/{image_id:path}/export")
def gee_image_export(image_id: str, req: ExportRequest):
    try:
        bbox_list = [float(x) for x in req.bbox.split(",")]
    except ValueError:
        raise HTTPException(400, "Invalid bbox")

    try:
        url = _get_service().export_region(image_id, bbox_list, req.scale, req.bands)
        return {"download_url": url}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


class IndexRequest(BaseModel):
    index_type: str
    bbox: str | None = None
    dimensions: int = 512


@router.post("/image/{image_id:path}/index")
def gee_image_index(image_id: str, req: IndexRequest):
    bbox_list = None
    if req.bbox:
        try:
            bbox_list = [float(x) for x in req.bbox.split(",")]
        except ValueError:
            raise HTTPException(400, "Invalid bbox")

    try:
        return _get_service().compute_index(image_id, req.index_type, bbox_list, req.dimensions)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

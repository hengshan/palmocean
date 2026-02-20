"""Sprint 2 — v1 Data API: upload, STAC search, GEE integration."""

from __future__ import annotations

import logging
import os
import tempfile
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.data_v1 import (
    DatasetListResponse,
    DatasetMeta,
    DatasetUploadResponse,
    GEECollectionInfo,
    GEEExportRequest,
    GEEExportResponse,
    GEESearchRequest,
    GEESearchResponse,
    GEEImageResult,
    STACCollectionInfo,
    STACImportRequest,
    STACImportResponse,
    STACProviderInfo,
    STACSearchRequest,
    STACSearchResponse,
    STACItemResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/data", tags=["data-v1"])


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

def _get_storage():
    from app.services.upload.storage import save_file, extract_metadata, get_local_path, delete_file
    return save_file, extract_metadata, get_local_path, delete_file


def _get_stac_service():
    from app.services.stac_service import stac_service
    return stac_service


def _get_gee_service():
    from app.services.gee_service import gee_service
    return gee_service


def _get_settings():
    from app.config import settings
    return settings


def _asset_to_meta(a) -> DatasetMeta:
    """Convert an ImageryAsset ORM object to DatasetMeta."""
    return DatasetMeta(
        dataset_id=a.asset_id,
        name=a.name or "",
        original_name=a.name or "",
        uri=a.uri,
        bounds=None,  # footprint is geometry, skip for listing
        crs=a.crs,
        resolution=None,
        width=None,
        height=None,
        bands=a.bands,
        file_size=a.size_bytes,
        source_type=a.source_type,
        created_at=a.created_at,
    )


# ═══════════════════════════════════════════════════════════════════════
# Upload endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.post("/upload", response_model=DatasetUploadResponse)
async def upload_dataset(
    file: UploadFile,
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    """Upload a GeoTIFF or satellite image. Stores to MinIO/local, extracts metadata."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    save_file, extract_metadata, get_local_path, delete_file = _get_storage()
    settings = _get_settings()

    # Stream to temp file for large file support
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1])
    try:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            tmp.write(chunk)
        tmp.close()

        # Read back for storage
        with open(tmp.name, "rb") as f:
            content = f.read()

        file_id, filename, storage_path = save_file(content, file.filename)

        # Extract metadata from the temp file (already local)
        meta = extract_metadata(tmp.name)
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)

    # Verify project exists
    from app.models.tenancy import Project
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Create ImageryAsset record
    from app.models.assets import ImageryAsset

    bounds = meta.get("bounds")
    footprint = None
    if bounds and len(bounds) == 4:
        try:
            from geoalchemy2.elements import WKTElement
            w, s, e, n = bounds
            wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
            footprint = WKTElement(wkt, srid=4326)
        except Exception:
            pass

    resolution = meta.get("resolution")
    gsd_cm = None
    if resolution:
        # Approximate GSD in cm (assumes degrees → ~111km/deg at equator for EPSG:4326)
        gsd_cm = int(min(resolution) * 100) if meta.get("crs") and "4326" not in str(meta.get("crs", "")) else None

    asset = ImageryAsset(
        org_id=project.org_id,
        project_id=project_id,
        name=file.filename,
        asset_type="raster",
        source_type="upload",
        uri=storage_path,
        format=os.path.splitext(file.filename)[1].lstrip(".").lower(),
        crs=meta.get("crs", "EPSG:4326"),
        size_bytes=meta.get("file_size"),
        bands={"count": len(meta.get("bands", []))} if isinstance(meta.get("bands"), list) else meta.get("bands"),
        footprint=footprint,
        gsd_cm=gsd_cm,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    return DatasetUploadResponse(
        dataset_id=asset.asset_id,
        name=file.filename,
        uri=storage_path,
        bounds=bounds,
        crs=meta.get("crs"),
        resolution=resolution,
        bands=asset.bands,
        file_size=meta.get("file_size"),
    )


@router.get("/datasets", response_model=DatasetListResponse)
def list_datasets(
    project_id: uuid.UUID = Query(...),
    source_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List uploaded datasets for a project."""
    from app.models.assets import ImageryAsset

    q = db.query(ImageryAsset).filter(
        ImageryAsset.project_id == project_id,
        ImageryAsset.deleted_at.is_(None),
    )
    if source_type:
        q = q.filter(ImageryAsset.source_type == source_type)

    total = q.count()
    assets = q.order_by(ImageryAsset.created_at.desc()).offset(offset).limit(limit).all()

    return DatasetListResponse(
        datasets=[_asset_to_meta(a) for a in assets],
        total=total,
    )


@router.get("/datasets/{dataset_id}", response_model=DatasetMeta)
def get_dataset(dataset_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get dataset details."""
    from app.models.assets import ImageryAsset

    asset = db.query(ImageryAsset).filter(
        ImageryAsset.asset_id == dataset_id,
        ImageryAsset.deleted_at.is_(None),
    ).first()
    if not asset:
        raise HTTPException(404, "Dataset not found")
    return _asset_to_meta(asset)


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: uuid.UUID, db: Session = Depends(get_db)):
    """Soft-delete a dataset."""
    from app.models.assets import ImageryAsset

    asset = db.query(ImageryAsset).filter(
        ImageryAsset.asset_id == dataset_id,
        ImageryAsset.deleted_at.is_(None),
    ).first()
    if not asset:
        raise HTTPException(404, "Dataset not found")

    asset.deleted_at = datetime.utcnow()
    db.commit()

    # Best-effort delete from storage
    try:
        _, _, _, delete_file = _get_storage()
        delete_file(os.path.basename(asset.uri))
    except Exception:
        logger.warning(f"Failed to delete storage file for {dataset_id}")


# ═══════════════════════════════════════════════════════════════════════
# STAC endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.get("/stac/providers", response_model=dict[str, STACProviderInfo])
def stac_providers():
    """List available STAC providers."""
    svc = _get_stac_service()
    return svc.get_providers()


@router.get("/stac/collections/{provider}", response_model=list[STACCollectionInfo])
def stac_collections(provider: str, limit: int = Query(50, ge=1, le=200)):
    """List collections for a STAC provider."""
    svc = _get_stac_service()
    try:
        return svc.get_collections(provider, limit)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error fetching collections: {e}")


@router.post("/stac/search", response_model=STACSearchResponse)
def stac_search(req: STACSearchRequest):
    """Search satellite imagery from a STAC provider."""
    svc = _get_stac_service()
    try:
        items = svc.search(
            provider=req.provider,
            collection=req.collection,
            bbox=req.bbox,
            datetime=req.datetime,
            limit=req.limit,
            query=req.query,
        )
        return STACSearchResponse(
            provider=req.provider,
            collection=req.collection,
            items=[STACItemResult(**item) for item in items],
            total=len(items),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"STAC search error: {e}")


@router.post("/stac/import", response_model=STACImportResponse)
async def stac_import(req: STACImportRequest, db: Session = Depends(get_db)):
    """Import a STAC item asset into PalmView (download COG → MinIO)."""
    svc = _get_stac_service()

    # Verify project
    from app.models.tenancy import Project
    project = db.query(Project).filter(Project.project_id == req.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    try:
        # Get item info
        item_data = svc.get_item(req.provider, req.collection, req.item_id)
        if req.asset_key not in item_data["assets"]:
            raise HTTPException(400, f"Asset key '{req.asset_key}' not found. Available: {list(item_data['assets'].keys())}")

        # Download to temp dir
        tmp_dir = tempfile.mkdtemp(prefix="stac_import_")
        local_path = await svc.download_asset(
            req.provider, req.collection, req.item_id, req.asset_key, tmp_dir
        )

        # Upload to storage
        save_file, extract_metadata, _, _ = _get_storage()
        filename = os.path.basename(local_path)
        with open(local_path, "rb") as f:
            content = f.read()

        file_id, stored_name, storage_path = save_file(content, filename)
        meta = extract_metadata(local_path)

        # Cleanup temp
        try:
            os.unlink(local_path)
            os.rmdir(tmp_dir)
        except Exception:
            pass

        # Create ImageryAsset + StacAssetLink
        from app.models.assets import ImageryAsset, StacAssetLink

        bounds = meta.get("bounds")
        footprint = None
        if bounds and len(bounds) == 4:
            try:
                from geoalchemy2.elements import WKTElement
                w, s, e, n = bounds
                wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
                footprint = WKTElement(wkt, srid=4326)
            except Exception:
                pass

        # Create STAC link
        settings = _get_settings()
        provider_urls = {
            "planetary-computer": settings.stac_planetary_computer_url,
            "earth-search": settings.stac_earth_search_url,
            "copernicus": settings.stac_copernicus_url,
        }

        link = StacAssetLink(
            org_id=project.org_id,
            project_id=req.project_id,
            source=req.provider,
            stac_api_url=provider_urls.get(req.provider),
            collection_id=req.collection,
            item_id=req.item_id,
            asset_key=req.asset_key,
            footprint=footprint,
            cloud_cover_pct=item_data.get("cloud_cover"),
        )
        db.add(link)
        db.flush()

        asset = ImageryAsset(
            org_id=project.org_id,
            project_id=req.project_id,
            name=f"{req.collection}/{req.item_id}",
            asset_type="raster",
            source_type="stac",
            uri=storage_path,
            format="tif",
            stac_link_id=link.link_id,
            crs=meta.get("crs", "EPSG:4326"),
            size_bytes=meta.get("file_size"),
            footprint=footprint,
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)

        return STACImportResponse(
            dataset_id=asset.asset_id,
            uri=storage_path,
            status="imported",
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("STAC import failed")
        raise HTTPException(500, f"Import failed: {e}")


# ═══════════════════════════════════════════════════════════════════════
# GEE endpoints
# ═══════════════════════════════════════════════════════════════════════

def _check_gee_available():
    """Check if GEE is configured; raise 501 if not."""
    svc = _get_gee_service()
    status = svc.status()
    if status["status"] == "not_configured":
        raise HTTPException(501, "GEE not configured. Set GEO_GEE_PROJECT env var.")
    if status["status"] == "error":
        raise HTTPException(503, f"GEE error: {status.get('message')}")
    return svc


@router.get("/gee/collections", response_model=list[GEECollectionInfo])
def gee_collections():
    """List commonly used GEE collections."""
    svc = _get_gee_service()
    return svc.get_collections()


@router.post("/gee/search", response_model=GEESearchResponse)
def gee_search(req: GEESearchRequest):
    """Search GEE image collection."""
    svc = _check_gee_available()
    try:
        results = svc.search_collection(
            collection_id=req.collection,
            bbox=req.bbox,
            date_range=(req.date_start, req.date_end),
            limit=req.limit,
            cloud_cover_max=req.cloud_cover_max,
        )
        return GEESearchResponse(
            collection=req.collection,
            images=[GEEImageResult(**r) for r in results],
            total=len(results),
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, f"GEE search error: {e}")


@router.post("/gee/export", response_model=GEEExportResponse)
async def gee_export(
    req: GEEExportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Export a GEE image region to MinIO (async via background task)."""
    svc = _check_gee_available()

    # Verify project
    from app.models.tenancy import Project
    project = db.query(Project).filter(Project.project_id == req.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    task_id = str(uuid.uuid4())

    def _do_export():
        try:
            import httpx

            # Get download URL from GEE
            url = svc.export_region(
                image_id=req.image_id,
                bbox=req.bbox,
                scale=req.scale,
                bands=req.bands,
            )

            # Download the GeoTIFF
            with httpx.Client(timeout=300, follow_redirects=True) as client:
                resp = client.get(url)
                resp.raise_for_status()
                content = resp.content

            # Save to storage
            save_file, extract_metadata, _, _ = _get_storage()
            filename = f"gee_{req.image_id.replace('/', '_')}_{task_id[:8]}.tif"
            file_id, stored_name, storage_path = save_file(content, filename)

            # Extract metadata from temp file
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".tif")
            tmp.write(content)
            tmp.close()
            meta = extract_metadata(tmp.name)
            os.unlink(tmp.name)

            # Create DB record
            from app.database import SessionLocal
            from app.models.assets import ImageryAsset

            bounds = meta.get("bounds")
            footprint = None
            if bounds and len(bounds) == 4:
                try:
                    from geoalchemy2.elements import WKTElement
                    w, s, e, n = bounds
                    wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
                    footprint = WKTElement(wkt, srid=4326)
                except Exception:
                    pass

            with SessionLocal() as session:
                asset = ImageryAsset(
                    org_id=project.org_id,
                    project_id=req.project_id,
                    name=f"GEE: {req.image_id}",
                    asset_type="raster",
                    source_type="gee",
                    uri=storage_path,
                    format="tif",
                    gee_export_id=uuid.UUID(task_id),
                    crs=meta.get("crs", "EPSG:4326"),
                    size_bytes=meta.get("file_size"),
                    footprint=footprint,
                )
                session.add(asset)
                session.commit()

            logger.info(f"GEE export {task_id} completed: {storage_path}")
        except Exception:
            logger.exception(f"GEE export {task_id} failed")

    background_tasks.add_task(_do_export)

    return GEEExportResponse(
        task_id=task_id,
        status="started",
        message=f"Exporting {req.image_id} to storage. Check datasets list for completion.",
    )

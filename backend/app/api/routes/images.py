from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database import get_db
from app.models.image import ImageModel, ImageResponse
from app.services.upload.storage import get_file, get_file_url

router = APIRouter()


def _to_response(img: ImageModel) -> ImageResponse:
    return ImageResponse(
        id=img.id,
        filename=img.filename,
        original_name=img.original_name,
        bounds=img.bounds,
        crs=img.crs,
        resolution=[img.resolution_x, img.resolution_y]
        if img.resolution_x is not None
        else None,
        width=img.width,
        height=img.height,
        file_size=img.file_size,
        url=f"/api/images/{img.id}/file",
        captured_at=img.captured_at,
        source=img.source,
        created_at=img.created_at,
    )


@router.get("", response_model=list[ImageResponse])
def list_images(db: Session = Depends(get_db)):
    images = db.query(ImageModel).order_by(ImageModel.created_at.desc()).all()
    return [_to_response(i) for i in images]


@router.get("/{image_id}", response_model=ImageResponse)
def get_image(image_id: str, db: Session = Depends(get_db)):
    img = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not img:
        raise HTTPException(404, "Image not found")
    return _to_response(img)


@router.get("/{image_id}/file")
def get_image_file(image_id: str, db: Session = Depends(get_db)):
    img = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not img:
        raise HTTPException(404, "Image not found")
    if app_settings.storage_backend == "s3":
        url = get_file_url(img.filename)
        return RedirectResponse(url)
    return FileResponse(img.file_path, filename=img.original_name)


# --- Phase 9: Multi-temporal management ---

class ImageMetadataUpdate(BaseModel):
    captured_at: datetime | None = None
    source: str | None = None


@router.patch("/{image_id}")
def update_image_metadata(image_id: str, body: ImageMetadataUpdate, db: Session = Depends(get_db)):
    """Update image metadata (capture date, source)."""
    img = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not img:
        raise HTTPException(404, "Image not found")
    if body.captured_at is not None:
        img.captured_at = body.captured_at
    if body.source is not None:
        img.source = body.source
    db.commit()
    db.refresh(img)
    return _to_response(img)


@router.get("/timeline/list")
def list_timeline(
    bounds: str | None = Query(None, description="west,south,east,north"),
    db: Session = Depends(get_db),
):
    """Get images sorted by capture date for timeline view."""
    q = db.query(ImageModel).filter(ImageModel.captured_at.isnot(None))
    images = q.order_by(ImageModel.captured_at.asc()).all()
    return {
        "timeline": [
            {
                "id": img.id,
                "name": img.original_name,
                "captured_at": img.captured_at.isoformat() if img.captured_at else None,
                "source": img.source,
                "bounds": img.bounds,
                "url": f"/api/images/{img.id}/file",
            }
            for img in images
        ]
    }

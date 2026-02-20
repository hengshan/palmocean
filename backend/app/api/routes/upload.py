from fastapi import APIRouter, UploadFile, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.image import ImageModel, ImageResponse
from app.config import settings as app_settings
from app.services.upload.storage import save_file, extract_metadata, get_local_path

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
        created_at=img.created_at,
    )


@router.post("", response_model=ImageResponse)
async def upload_file_endpoint(file: UploadFile, db: Session = Depends(get_db)):
    if not file.filename:
        raise HTTPException(400, "No filename")

    content = await file.read()
    file_id, filename, file_path = save_file(content, file.filename)

    # For metadata extraction we need a local path
    if app_settings.storage_backend == "s3":
        import os
        local_path = get_local_path(filename)
        meta = extract_metadata(local_path)
        os.unlink(local_path)
    else:
        meta = extract_metadata(file_path)

    img = ImageModel(
        id=file_id,
        filename=filename,
        original_name=file.filename,
        file_path=file_path,
        bounds=meta.get("bounds"),
        crs=meta.get("crs"),
        resolution_x=meta.get("resolution", [None, None])[0] if meta.get("resolution") else None,
        resolution_y=meta.get("resolution", [None, None])[1] if meta.get("resolution") else None,
        width=meta.get("width", 0),
        height=meta.get("height", 0),
        file_size=meta.get("file_size", 0),
    )
    db.add(img)
    db.commit()
    db.refresh(img)

    return _to_response(img)

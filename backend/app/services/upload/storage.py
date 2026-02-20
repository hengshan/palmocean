import uuid
import os
import tempfile
from pathlib import Path

from app.config import settings


def _get_s3_client():
    """Lazy-load boto3 and return an S3 client."""
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint or None,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
    )


def save_file(content: bytes, original_name: str) -> tuple[str, str, str]:
    """Save file. Returns (file_id, filename, path_or_key).

    For local mode: path_or_key is the absolute file path.
    For s3 mode: path_or_key is the S3 object key.
    """
    file_id = str(uuid.uuid4())
    ext = Path(original_name).suffix.lower()
    filename = f"{file_id}{ext}"

    if settings.storage_backend == "s3":
        key = f"uploads/{filename}"
        client = _get_s3_client()
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=content)
        return file_id, filename, key
    else:
        file_path = os.path.join(settings.upload_dir, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        return file_id, filename, file_path


def get_file(filename: str) -> bytes:
    """Get file contents as bytes."""
    if settings.storage_backend == "s3":
        key = f"uploads/{filename}"
        client = _get_s3_client()
        resp = client.get_object(Bucket=settings.s3_bucket, Key=key)
        return resp["Body"].read()
    else:
        file_path = os.path.join(settings.upload_dir, filename)
        with open(file_path, "rb") as f:
            return f.read()


def get_file_url(filename: str) -> str:
    """Return a local path or presigned S3 URL."""
    if settings.storage_backend == "s3":
        key = f"uploads/{filename}"
        client = _get_s3_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=3600,
        )
    else:
        return os.path.join(settings.upload_dir, filename)


def delete_file(filename: str) -> None:
    """Delete a file from storage."""
    if settings.storage_backend == "s3":
        key = f"uploads/{filename}"
        client = _get_s3_client()
        client.delete_object(Bucket=settings.s3_bucket, Key=key)
    else:
        file_path = os.path.join(settings.upload_dir, filename)
        if os.path.exists(file_path):
            os.remove(file_path)


def get_local_path(filename: str) -> str:
    """Get a local file path (downloads from S3 to temp file if needed).
    
    Caller is responsible for cleanup if storage_backend is s3.
    """
    if settings.storage_backend == "s3":
        ext = Path(filename).suffix
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        tmp.write(get_file(filename))
        tmp.close()
        return tmp.name
    else:
        return os.path.join(settings.upload_dir, filename)


def extract_metadata(file_path: str) -> dict:
    """Extract image metadata. Uses rasterio for GeoTIFF, PIL for others.
    
    file_path should be a local filesystem path (use get_local_path for S3 files).
    """
    ext = Path(file_path).suffix.lower()
    meta: dict = {}

    if ext in (".tif", ".tiff"):
        try:
            import rasterio
            with rasterio.open(file_path) as ds:
                meta["width"] = ds.width
                meta["height"] = ds.height
                meta["crs"] = str(ds.crs) if ds.crs else None
                if ds.transform and ds.crs:
                    from rasterio.warp import transform_bounds
                    b = ds.bounds
                    # Convert bounds to EPSG:4326 for frontend compatibility
                    try:
                        lonlat_bounds = transform_bounds(ds.crs, "EPSG:4326", b.left, b.bottom, b.right, b.top)
                        meta["bounds"] = list(lonlat_bounds)
                    except Exception:
                        meta["bounds"] = [b.left, b.bottom, b.right, b.top]
                    meta["resolution"] = [abs(ds.res[0]), abs(ds.res[1])]
                else:
                    meta["bounds"] = None
                    meta["resolution"] = None
        except Exception:
            meta.setdefault("width", 0)
            meta.setdefault("height", 0)
    else:
        try:
            from PIL import Image
            with Image.open(file_path) as img:
                meta["width"] = img.width
                meta["height"] = img.height
        except Exception:
            meta["width"] = 0
            meta["height"] = 0

    meta["file_size"] = os.path.getsize(file_path)
    return meta

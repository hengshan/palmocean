"""MinIO object storage helper."""

import os
from minio import Minio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "palmview")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "palmview-assets")


def get_minio_client() -> Minio:
    return Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)


def upload_file(local_path: str, object_name: str, content_type: str = "application/octet-stream") -> str:
    """Upload a file to MinIO and return the object URL."""
    client = get_minio_client()
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)
    client.fput_object(MINIO_BUCKET, object_name, local_path, content_type=content_type)
    return f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{object_name}"


def get_presigned_url(object_name: str, expires_hours: int = 24) -> str:
    """Get a presigned download URL."""
    from datetime import timedelta
    client = get_minio_client()
    return client.presigned_get_object(MINIO_BUCKET, object_name, expires=timedelta(hours=expires_hours))

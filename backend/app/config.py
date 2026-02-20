import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    database_url: str = f"sqlite:///{BASE_DIR / 'storage' / 'palmview.db'}"
    upload_dir: str = str(BASE_DIR / "storage" / "uploads")
    allowed_origins: list[str] = ["http://localhost:3000", "http://nano.taila366a3.ts.net:3000"]
    
    # Inference API configuration
    inference_api_url: str = "http://localhost:8001"
    
    # Redis (optional, for caching)
    redis_url: str | None = None

    # Storage backend: "local" or "s3"
    storage_backend: str = "local"

    # S3-compatible storage (R2, S3, MinIO)
    s3_bucket: str = ""
    s3_endpoint: str = ""
    s3_region: str = "auto"
    s3_access_key: str = ""
    s3_secret_key: str = ""

    # Google Earth Engine
    gee_service_account_email: str = "palmview@pandai-888888.iam.gserviceaccount.com"
    gee_service_account_key_file: str = str(BASE_DIR / "credentials" / "pandai-888888-bc1fa6e8406f.json")
    gee_project: str = "pandai-888888"

    # RemoteCLIP / Semantic Search
    clip_weights_path: str = str(BASE_DIR.parent / "ml" / "weights" / "RemoteCLIP-ViT-L-14.pt")
    tile_data_dir: str = str(BASE_DIR.parent / "data" / "johor_s2")

    # STAC providers
    stac_planetary_computer_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    stac_earth_search_url: str = "https://earth-search.aws.element84.com/v1"
    stac_copernicus_url: str = "https://catalogue.dataspace.copernicus.eu/stac"

    model_config = {"env_prefix": "GEO_"}


settings = Settings()

# Ensure directories exist
os.makedirs(settings.upload_dir, exist_ok=True)

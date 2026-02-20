import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Float, DateTime, JSON
from pydantic import BaseModel

from app.database import Base


class ImageModel(Base):
    __tablename__ = "images"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    bounds = Column(JSON, nullable=True)  # [west, south, east, north]
    crs = Column(String, nullable=True)
    resolution_x = Column(Float, nullable=True)
    resolution_y = Column(Float, nullable=True)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    file_size = Column(Integer, nullable=False)
    captured_at = Column(DateTime, nullable=True)  # When the imagery was captured
    source = Column(String, nullable=True)  # e.g. "sentinel-2", "drone", "onemap"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# Pydantic schemas
class ImageResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    bounds: list[float] | None = None
    crs: str | None = None
    resolution: list[float] | None = None
    width: int
    height: int
    file_size: int
    url: str
    captured_at: datetime | None = None
    source: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

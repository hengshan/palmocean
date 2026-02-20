from pydantic import BaseModel, Field
from typing import Any


class PointCoord(BaseModel):
    lng: float
    lat: float


class BBox(BaseModel):
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float


class PointPrompt(BaseModel):
    image_id: str
    point: PointCoord
    label: int = 1


class BoxPrompt(BaseModel):
    image_id: str
    bbox: BBox


class AutoPrompt(BaseModel):
    image_id: str
    bbox: BBox | None = None


class InferenceStats(BaseModel):
    count: int
    total_area: float


class SemanticPrompt(BaseModel):
    image_id: str
    classes: list[str] = Field(default_factory=lambda: ["building", "road", "vegetation", "water", "solar_panel"])
    bbox: BBox | None = None


class TextPrompt(BaseModel):
    image_id: str
    prompt: str
    bbox: BBox | None = None


class InferenceResponse(BaseModel):
    task_id: str
    status: str = "completed"
    results: dict[str, Any] = Field(
        default_factory=lambda: {"type": "FeatureCollection", "features": []}
    )
    stats: InferenceStats = Field(default_factory=lambda: InferenceStats(count=0, total_area=0.0))

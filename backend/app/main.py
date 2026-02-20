import time
from collections import defaultdict

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import health, upload, inference, features, projects, export, change_detection, training, tiles, ws, auth, collaboration
from app.api.routes import images
from app.api.routes import data_gee, data_stac
from app.api.routes import search
from app.api.v1 import inference as inference_v1
from app.api.v1 import models as models_v1
from app.api.v1 import map_configs as map_configs_v1
from app.api.v1 import projects as projects_v1
from app.api.v1 import assets as assets_v1
from app.api.v1 import auth as auth_v1
from app.database import init_db
from app.config import settings


# --- Simple in-memory rate limiter ---
class RateLimitMiddleware(BaseHTTPMiddleware):
    """Basic rate limiting: 60 requests/minute per IP, 10/min for inference."""

    def __init__(self, app):
        super().__init__(app)
        self.requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60  # 1 minute

        # Clean old entries
        self.requests[client_ip] = [t for t in self.requests[client_ip] if now - t < window]

        # Stricter limit for inference endpoints
        is_inference = request.url.path.startswith("/api/inference")
        limit = 10 if is_inference else 120

        if len(self.requests[client_ip]) >= limit:
            return Response(
                content='{"detail":"Rate limit exceeded. Try again later."}',
                status_code=429,
                media_type="application/json",
            )

        self.requests[client_ip].append(now)
        return await call_next(request)


app = FastAPI(title="PalmView API", version="0.1.0", docs_url="/api/docs", redoc_url="/api/redoc")

# Middleware order matters: rate limit first, then CORS
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routes ---
# Routers with their own prefix (auth, projects, export, change_detection, training)
# are mounted directly. Others get prefix here.
app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(auth.router)  # has prefix="/api/auth"
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(inference.router, prefix="/api/inference", tags=["inference"])
app.include_router(features.router)  # routes have full /api/... paths
app.include_router(projects.router)  # has prefix="/api/projects"
app.include_router(export.router)  # has prefix="/api/projects/{project_id}/export"
app.include_router(change_detection.router)  # has prefix="/api/change-detection"
app.include_router(training.router)  # has prefix="/api/training"
app.include_router(tiles.router)  # routes have full /api/... paths
app.include_router(collaboration.router, prefix="/api/collaboration", tags=["collaboration"])
app.include_router(data_gee.router, prefix="/api/data/gee", tags=["data-gee"])
app.include_router(data_stac.router, prefix="/api/data/stac", tags=["data-stac"])
app.include_router(search.router)  # has prefix="/api/search"
app.include_router(ws.router, tags=["websocket"])

# --- Sprint 1: v1 API routes ---
app.include_router(inference_v1.router)
app.include_router(models_v1.router)
app.include_router(map_configs_v1.router)
app.include_router(projects_v1.router)
app.include_router(assets_v1.router)
app.include_router(auth_v1.router)


@app.on_event("startup")
def on_startup():
    init_db()

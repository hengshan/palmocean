"""Minimal FastAPI app — Sprint 1 v1 APIs only."""

import time
from collections import defaultdict

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1 import inference as inference_v1
from app.api.v1 import models as models_v1
from app.api.v1 import map_configs as map_configs_v1
from app.api.v1 import projects as projects_v1
from app.api.v1 import assets as assets_v1
from app.api.v1 import auth as auth_v1
from app.api.v1 import data_stac
from app.api.v1 import data_gee
from app.api.v1 import data as data_v1
from app.api.v1 import palmocean as palmocean_v1
from app.api.routes import plantation as plantation_routes
from app.api.routes import seed3d as seed3d_routes
from app.api.routes import inference as inference_routes
from app.database import init_db


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        self.requests[client_ip] = [t for t in self.requests[client_ip] if now - t < 60]
        if len(self.requests[client_ip]) >= 120:
            return Response(content='{"detail":"Rate limit exceeded"}', status_code=429, media_type="application/json")
        self.requests[client_ip].append(now)
        return await call_next(request)


app = FastAPI(title="PalmView API", version="0.1.0", docs_url="/docs", redoc_url="/redoc")

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sprint 1 v1 APIs
app.include_router(inference_v1.router)
app.include_router(models_v1.router)
app.include_router(map_configs_v1.router)
app.include_router(projects_v1.router)
app.include_router(assets_v1.router)
app.include_router(auth_v1.router)
app.include_router(data_stac.router, prefix="/api/v1/data/stac", tags=["data-stac"])
app.include_router(data_gee.router, prefix="/api/v1/data/gee", tags=["data-gee"])
app.include_router(data_v1.router)
app.include_router(plantation_routes.router)
app.include_router(seed3d_routes.router)
app.include_router(inference_routes.router, prefix="/api/inference", tags=["inference-persist"])
app.include_router(palmocean_v1.router, prefix="/api/v1/palmocean", tags=["palmocean"])


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.on_event("startup")
def on_startup():
    init_db()
    # Initialize PalmOcean TimescaleDB (may not be running locally)
    try:
        from app.palmocean_db import init_palmocean_db
        init_palmocean_db()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"PalmOcean DB init skipped: {e}")

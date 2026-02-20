from fastapi import APIRouter

from app.services.cache import cache

router = APIRouter()


@router.get("")
async def health_check():
    return {
        "status": "ok",
        "cache": cache.stats(),
    }

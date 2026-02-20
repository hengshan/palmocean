"""
Phase 11: Simple in-memory LRU cache with optional Redis backend.

Uses in-memory cache by default. When Redis is configured (GEO_REDIS_URL),
automatically uses Redis for distributed caching.
"""

import json
import hashlib
import logging
import time
from collections import OrderedDict
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


class MemoryCache:
    """Simple LRU in-memory cache."""

    def __init__(self, max_size: int = 256, ttl: int = 300):
        self._cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl

    def get(self, key: str) -> Any | None:
        if key in self._cache:
            ts, value = self._cache[key]
            if time.time() - ts < self._ttl:
                self._cache.move_to_end(key)
                return value
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if key in self._cache:
            del self._cache[key]
        self._cache[key] = (time.time(), value)
        if len(self._cache) > self._max_size:
            self._cache.popitem(last=False)

    def delete(self, key: str) -> None:
        self._cache.pop(key, None)

    def clear(self) -> None:
        self._cache.clear()

    def stats(self) -> dict:
        return {
            "type": "memory",
            "size": len(self._cache),
            "max_size": self._max_size,
            "ttl": self._ttl,
        }


class RedisCache:
    """Redis-backed cache (when available)."""

    def __init__(self, url: str, ttl: int = 300):
        self._ttl = ttl
        self._client = None
        self._url = url
        try:
            import redis
            self._client = redis.from_url(url, decode_responses=True)
            self._client.ping()
            logger.info(f"Redis cache connected: {url}")
        except Exception as e:
            logger.warning(f"Redis not available ({e}), falling back to memory cache")
            self._client = None

    @property
    def available(self) -> bool:
        return self._client is not None

    def get(self, key: str) -> Any | None:
        if not self._client:
            return None
        try:
            val = self._client.get(f"geo:{key}")
            return json.loads(val) if val else None
        except Exception:
            return None

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if not self._client:
            return
        try:
            self._client.setex(f"geo:{key}", ttl or self._ttl, json.dumps(value))
        except Exception:
            pass

    def delete(self, key: str) -> None:
        if self._client:
            try:
                self._client.delete(f"geo:{key}")
            except Exception:
                pass

    def clear(self) -> None:
        if self._client:
            try:
                keys = self._client.keys("geo:*")
                if keys:
                    self._client.delete(*keys)
            except Exception:
                pass

    def stats(self) -> dict:
        if not self._client:
            return {"type": "redis", "available": False}
        try:
            info = self._client.info("memory")
            return {
                "type": "redis",
                "available": True,
                "used_memory_human": info.get("used_memory_human", "?"),
                "ttl": self._ttl,
            }
        except Exception:
            return {"type": "redis", "available": False}


def _create_cache() -> MemoryCache | RedisCache:
    """Create the appropriate cache backend."""
    redis_url = getattr(settings, "redis_url", None)
    if redis_url:
        rc = RedisCache(redis_url)
        if rc.available:
            return rc
    return MemoryCache()


# Singleton
cache = _create_cache()


def cache_key(*parts: str) -> str:
    """Generate a cache key from parts."""
    raw = ":".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()

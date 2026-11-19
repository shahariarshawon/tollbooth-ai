"""Tenant-aware semantic and exact-match cache foundation.

The cache key is safely hashed and isolated by tenant ID and model, preventing
any cross-tenant data leakage or collision.
Includes hit/miss metrics and graceful non-breaking degradation if Redis is unavailable.
"""

from __future__ import annotations

import hashlib
import os

import redis.asyncio as redis

DEFAULT_TTL_SECONDS = 3600
CACHE_KEY_PREFIX = "ai_cache:"


def make_cache_key(prompt: str, tenant_id: str = "global", model: str | None = None) -> str:
    """Computes a tenant-isolated SHA-256 digest for prompt caching.

    Key structure: `ai_cache:<tenant_id>:<sha256(tenant_id:model:prompt)>`
    """
    model_str = model or "default"
    raw_key = f"{tenant_id}:{model_str}:{prompt}"
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return f"{CACHE_KEY_PREFIX}{tenant_id}:{digest}"


class CacheService:
    """Stores and retrieves AI completions by tenant and prompt hash."""

    def __init__(self, redis_url: str | None = None, client: redis.Redis | None = None) -> None:
        self._redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379")
        self._client: redis.Redis | None = client
        self._hits: int = 0
        self._misses: int = 0

    def _get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(self._redis_url, decode_responses=True)
        return self._client

    def get_metrics(self) -> dict[str, int | float]:
        """Returns hit and miss counts and hit ratio."""
        total = self._hits + self._misses
        ratio = round(self._hits / total, 4) if total > 0 else 0.0
        return {
            "hits": self._hits,
            "misses": self._misses,
            "total_lookups": total,
            "hit_ratio": ratio,
        }

    async def get(
        self, prompt: str, tenant_id: str = "global", model: str | None = None
    ) -> str | None:
        try:
            client = self._get_client()
            key = make_cache_key(prompt, tenant_id=tenant_id, model=model)
            value = await client.get(key)
            if value is not None:
                self._hits += 1
            else:
                self._misses += 1
            return value
        except Exception:
            # Graceful non-breaking fallback on connection failure
            self._misses += 1
            return None

    async def set(
        self,
        prompt: str,
        response: str,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        tenant_id: str = "global",
        model: str | None = None,
    ) -> None:
        try:
            client = self._get_client()
            key = make_cache_key(prompt, tenant_id=tenant_id, model=model)
            await client.set(key, response, ex=ttl_seconds)
        except Exception:
            # Non-breaking cache set fallback
            pass

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

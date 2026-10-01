"""Semantic cache foundation (Task 5).

An exact-match cache today: the key is a hash of the prompt, so two identical prompts share a
cache entry. "Semantic" (embedding-similarity) lookup — two *differently worded* prompts matching
— needs embeddings, which is why TECH STACK lists "PostgreSQL pgVector preparation": once prompts
are embedded and stored in pgvector, this service can look up the nearest stored embedding instead
of hashing the exact text. That is future work; this module is the interface it would slot behind
(`get`/`set`/`make_cache_key`), already backed by Redis as the spec asks.

Not wired into the gateway's hot path yet (Task 6's flow does not mention it): this is the
foundation, exposed here and over HTTP (`/security/cache/...`) so it is usable and testable alone.
"""

from __future__ import annotations

import hashlib
import os

import redis.asyncio as redis

DEFAULT_TTL_SECONDS = 3600
CACHE_KEY_PREFIX = "ai_cache:"


def make_cache_key(prompt: str) -> str:
    """`hash(prompt)`, namespaced so it cannot collide with another key in the same Redis."""
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    return f"{CACHE_KEY_PREFIX}{digest}"


class CacheService:
    """Stores and looks up a previous AI response by a hash of its prompt. Reuses the platform's own
    Redis (`REDIS_URL`) rather than standing up a second store for it."""

    def __init__(self, redis_url: str | None = None, client: redis.Redis | None = None) -> None:
        self._redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379")
        # Accepting a pre-built client lets tests pass a fake (e.g. fakeredis) without touching a
        # real Redis instance; production code leaves this unset and gets a real one, lazily.
        self._client: redis.Redis | None = client

    def _get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(self._redis_url, decode_responses=True)
        return self._client

    async def get(self, prompt: str) -> str | None:
        client = self._get_client()
        value = await client.get(make_cache_key(prompt))
        return value

    async def set(self, prompt: str, response: str, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        client = self._get_client()
        await client.set(make_cache_key(prompt), response, ex=ttl_seconds)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

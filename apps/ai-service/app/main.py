import time
from typing import Annotated

from fastapi import Depends, FastAPI

from app.security.cache import CacheService, make_cache_key
from app.security.models import (
    CacheLookupRequest,
    CacheLookupResponse,
    CacheStoreRequest,
    CacheStoreResponse,
    SecurityCheckRequest,
    SecurityCheckResponse,
    SecurityIssue,
)
from app.security.pii import find_pii
from app.security.prompt_guard import find_content_violations, find_prompt_injection

app = FastAPI(title="Tollbooth AI Service")

_started_at = time.monotonic()
_cache_service = CacheService()


def get_cache_service() -> CacheService:
    """A FastAPI dependency, not a direct reference to the module-level instance, so tests can
    swap in a fake (tests/test_cache.py) via `app.dependency_overrides`, skipping real Redis."""
    return _cache_service


CacheDependency = Annotated[CacheService, Depends(get_cache_service)]


@app.get("/health")
def health() -> dict[str, str | int]:
    return {
        "status": "ok",
        "service": "ai-service",
        "uptimeSeconds": round(time.monotonic() - _started_at),
    }


@app.post("/security/check", response_model=SecurityCheckResponse)
def check_security(request: SecurityCheckRequest) -> SecurityCheckResponse:
    """Runs every check (PII, prompt injection, the content filter) in one call: the gateway
    needs one round trip per request, not one per kind of check."""
    issues: list[SecurityIssue] = [
        SecurityIssue(type=match.type, preview=match.preview) for match in find_pii(request.text)
    ]

    injection_matches = find_prompt_injection(request.text)
    issues += [
        SecurityIssue(type="prompt_injection", preview=phrase) for phrase in injection_matches
    ]

    content_matches = find_content_violations(request.text)
    issues += [SecurityIssue(type="content_filter", preview=phrase) for phrase in content_matches]

    return SecurityCheckResponse(
        blocked=len(issues) > 0,
        safe=len(injection_matches) == 0,
        issues=issues,
    )


@app.post("/security/cache", response_model=CacheStoreResponse)
async def store_cache_entry(
    request: CacheStoreRequest, cache: CacheDependency
) -> CacheStoreResponse:
    await cache.set(request.prompt, request.response, request.ttl_seconds)
    return CacheStoreResponse(cached=True, key=make_cache_key(request.prompt))


@app.post("/security/cache/lookup", response_model=CacheLookupResponse)
async def lookup_cache_entry(
    request: CacheLookupRequest, cache: CacheDependency
) -> CacheLookupResponse:
    cached = await cache.get(request.prompt)
    return CacheLookupResponse(hit=cached is not None, response=cached)

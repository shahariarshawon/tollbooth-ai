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
from app.security.pii import find_pii, redact_pii
from app.security.prompt_guard import find_content_violations, find_prompt_injection

app = FastAPI(title="Tollbooth AI Service")

_started_at = time.monotonic()
_cache_service = CacheService()


@app.middleware("http")
async def trace_propagation_middleware(request, call_next):
    request_id = request.headers.get("x-request-id") or request.headers.get("x-correlation-id")
    traceparent = request.headers.get("traceparent")
    response = await call_next(request)
    if request_id:
        response.headers["x-request-id"] = request_id
    if traceparent:
        response.headers["traceparent"] = traceparent
    return response


def get_cache_service() -> CacheService:
    """FastAPI dependency injection for cache service."""
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
    """Evaluates input text against PII, prompt injection, and dangerous content.

    Supports configurable ALLOW, BLOCK, and REDACT policy decisions.
    """
    pii_matches = find_pii(request.text)
    issues: list[SecurityIssue] = [
        SecurityIssue(type=match.type, preview=match.preview) for match in pii_matches
    ]

    injection_matches = find_prompt_injection(request.text)
    issues += [
        SecurityIssue(type="prompt_injection", preview=phrase) for phrase in injection_matches
    ]

    content_matches = find_content_violations(request.text)
    issues += [SecurityIssue(type="content_filter", preview=phrase) for phrase in content_matches]

    has_pii = len(pii_matches) > 0
    has_injection = len(injection_matches) > 0
    has_content = len(content_matches) > 0

    pii_action = (
        request.policy.pii_action
        if request.policy
        else ("redact" if request.action_mode == "redact" else "block")
    )
    injection_action = request.policy.injection_action if request.policy else "block"
    content_action = request.policy.content_action if request.policy else "block"

    should_block = False
    action = "allow"
    redacted_text: str | None = None

    if has_injection and injection_action == "block":
        should_block = True
        action = "block"
    elif has_content and content_action == "block":
        should_block = True
        action = "block"
    elif has_pii:
        if pii_action == "block":
            should_block = True
            action = "block"
        elif pii_action == "redact":
            action = "redact"
            redacted_text = redact_pii(request.text)
        elif pii_action == "allow":
            action = "allow"
    elif not issues:
        action = "allow"

    return SecurityCheckResponse(
        blocked=should_block or (len(issues) > 0 and action == "block"),
        safe=len(injection_matches) == 0,
        issues=issues,
        action=action,
        redacted_text=redacted_text,
    )


@app.post("/security/cache", response_model=CacheStoreResponse)
async def store_cache_entry(
    request: CacheStoreRequest, cache: CacheDependency
) -> CacheStoreResponse:
    await cache.set(
        request.prompt,
        request.response,
        ttl_seconds=request.ttl_seconds,
        tenant_id=request.tenant_id,
        model=request.model,
    )
    key = make_cache_key(
        request.prompt, tenant_id=request.tenant_id, model=request.model
    )
    return CacheStoreResponse(cached=True, key=key)


@app.post("/security/cache/lookup", response_model=CacheLookupResponse)
async def lookup_cache_entry(
    request: CacheLookupRequest, cache: CacheDependency
) -> CacheLookupResponse:
    cached = await cache.get(request.prompt, tenant_id=request.tenant_id, model=request.model)
    return CacheLookupResponse(hit=cached is not None, response=cached)


@app.get("/security/cache/metrics")
def get_cache_metrics(cache: CacheDependency) -> dict[str, int | float]:
    return cache.get_metrics()

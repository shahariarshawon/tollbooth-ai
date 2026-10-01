"""Request/response shapes for the security and cache endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

IssueType = Literal[
    "email",
    "phone_number",
    "passport_number",
    "credit_card",
    "prompt_injection",
    "content_filter",
]


class SecurityCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000)


class SecurityIssue(BaseModel):
    type: IssueType
    """A masked preview (PII) or the matched phrase (injection/content filter), never raw PII."""
    preview: str


class SecurityCheckResponse(BaseModel):
    """`blocked` is the one field a caller needs to act on: true if anything here means the
    request should not go to a provider (any PII, any prompt injection, any content-filter
    match). `safe` specifically answers Task 3's question (is this free of prompt injection);
    `issues` lists everything found, PII included, for logging or a UI."""

    blocked: bool
    safe: bool
    issues: list[SecurityIssue]


class CacheStoreRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    response: str
    ttl_seconds: int = Field(default=3600, ge=1)


class CacheStoreResponse(BaseModel):
    cached: bool
    key: str


class CacheLookupRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


class CacheLookupResponse(BaseModel):
    hit: bool
    response: str | None = None

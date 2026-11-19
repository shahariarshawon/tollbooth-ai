"""Request/response shapes for security and cache endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

IssueType = Literal[
    "email",
    "phone_number",
    "passport_number",
    "credit_card",
    "ssn",
    "api_key",
    "prompt_injection",
    "content_filter",
]

PolicyDecision = Literal["allow", "block", "redact"]


class SecurityPolicyConfig(BaseModel):
    """Per-tenant or per-request policy overrides."""

    pii_action: PolicyDecision = "block"
    injection_action: Literal["allow", "block"] = "block"
    content_action: Literal["allow", "block"] = "block"


class SecurityCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000)
    tenant_id: str | None = None
    action_mode: PolicyDecision = "block"
    policy: SecurityPolicyConfig | None = None


class SecurityIssue(BaseModel):
    type: IssueType
    """A masked preview (PII) or the matched phrase (injection/content filter), never raw PII."""
    preview: str


class SecurityCheckResponse(BaseModel):
    """`blocked` is true if the request must be denied.

    `safe` is true if free of prompt injection.
    `action` provides the chosen decision (allow, block, redact).
    `redacted_text` contains sanitized prompt when action is redact.
    `issues` lists all flagged items for auditing and monitoring.
    """

    blocked: bool
    safe: bool
    issues: list[SecurityIssue]
    action: PolicyDecision = "allow"
    redacted_text: str | None = None


class CacheStoreRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    response: str
    tenant_id: str = "global"
    model: str | None = None
    ttl_seconds: int = Field(default=3600, ge=1)


class CacheStoreResponse(BaseModel):
    cached: bool
    key: str


class CacheLookupRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    tenant_id: str = "global"
    model: str | None = None


class CacheLookupResponse(BaseModel):
    hit: bool
    response: str | None = None

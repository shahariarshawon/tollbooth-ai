# ai-service

FastAPI service for AI processing: PII detection, prompt-injection and content checks (Phase 9), plus a
Redis-backed cache foundation. See [docs/architecture/ai-security.md](../../docs/architecture/ai-security.md)
for the full design; this is just how to run it.

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
pytest && ruff check .
```

The cache endpoints need the platform's own Redis reachable (`REDIS_URL`, default
`redis://localhost:6379`; `pnpm infra:up` from the repo root provides one). Everything else needs nothing
beyond the dependencies above.

## Endpoints

| Method & path                 | Body                                     | Returns                                      |
| ----------------------------- | ---------------------------------------- | -------------------------------------------- |
| `GET /health`                 | —                                        | `{status, service, uptimeSeconds}`           |
| `POST /security/check`        | `{"text": "..."}`                        | `{blocked, safe, issues: [{type, preview}]}` |
| `POST /security/cache`        | `{"prompt", "response", "ttl_seconds"?}` | `{cached, key}`                              |
| `POST /security/cache/lookup` | `{"prompt": "..."}`                      | `{hit, response}`                            |

The gateway calls `/security/check` on every chat completion before routing to a provider
(`apps/gateway/src/security/`). The cache endpoints are a standalone foundation, not yet called from that
request path.

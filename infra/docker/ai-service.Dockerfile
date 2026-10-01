FROM python:3.12-slim AS builder
WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip

COPY apps/ai-service/pyproject.toml ./
# Install production deps only (no [dev] extras)
RUN pip install --no-cache-dir -e .

COPY apps/ai-service/ ./

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner
WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder --chown=app:app /app ./
COPY --from=builder --chown=app:app /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder --chown=app:app /usr/local/bin/uvicorn /usr/local/bin/uvicorn

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

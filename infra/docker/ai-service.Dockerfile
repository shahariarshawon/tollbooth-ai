# The AI Security Service (FastAPI).
#
#   docker build -f infra/docker/ai-service.Dockerfile -t tollbooth/ai-service .
#
# Dependencies and the application are installed into /install in a builder stage; the runtime image
# copies that prefix and nothing else (no pip cache, no build tools, no tests).

ARG PYTHON_VERSION=3.12

FROM python:${PYTHON_VERSION}-slim AS builder
WORKDIR /build
COPY apps/ai-service/pyproject.toml ./
COPY apps/ai-service/app ./app
RUN pip install --no-cache-dir --prefix=/install .

FROM python:${PYTHON_VERSION}-slim AS runner
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=builder /install /usr/local

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ['PORT'], timeout=3)" || exit 1

# One worker by default, which suits a small container; set WEB_CONCURRENCY to scale up.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]

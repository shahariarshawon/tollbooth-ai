import time

from fastapi import FastAPI

app = FastAPI(title="Tollbooth AI Service")

_started_at = time.monotonic()


@app.get("/health")
def health() -> dict[str, str | int]:
    return {
        "status": "ok",
        "service": "ai-service",
        "uptimeSeconds": round(time.monotonic() - _started_at),
    }

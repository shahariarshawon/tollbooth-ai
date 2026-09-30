# ai-service

FastAPI service for AI processing (PII detection, prompt analysis, embeddings).

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
pytest && ruff check .
```

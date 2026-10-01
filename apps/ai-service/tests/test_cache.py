import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_cache_service
from app.security.cache import CacheService, make_cache_key


def fake_cache_service() -> CacheService:
    # A real Redis-protocol server in memory, not a real network connection: fast, and needs
    # nothing running locally. The project's Node services use a real Redis in their tests
    # instead; fakeredis is the Python equivalent, without a Redis service in ai-service's CI job.
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    return CacheService(client=client)


class TestMakeCacheKey:
    def test_is_deterministic_for_the_same_prompt(self):
        assert make_cache_key("hello") == make_cache_key("hello")

    def test_differs_for_a_different_prompt(self):
        assert make_cache_key("hello") != make_cache_key("goodbye")


@pytest.mark.asyncio
class TestCacheService:
    async def test_returns_none_for_a_prompt_never_stored(self):
        cache = fake_cache_service()
        assert await cache.get("never stored") is None

    async def test_returns_the_stored_response_for_the_same_prompt(self):
        cache = fake_cache_service()
        await cache.set("What is 2+2?", "4")

        assert await cache.get("What is 2+2?") == "4"

    async def test_does_not_return_a_different_prompt_s_response(self):
        cache = fake_cache_service()
        await cache.set("What is 2+2?", "4")

        assert await cache.get("What is 3+3?") is None


class TestCacheEndpoints:
    """Task 8: 'Cache returns stored response', exercised through the actual HTTP API the gateway
    would call, with a fake Redis behind it via FastAPI's own dependency override mechanism."""

    def setup_method(self):
        # One instance per test, reused across requests within it: a new fakeredis per request (as a
        # literal `fake_cache_service` override would give) would never find what an earlier request
        # in the same test stored.
        shared_cache = fake_cache_service()
        app.dependency_overrides[get_cache_service] = lambda: shared_cache
        self.client = TestClient(app)

    def teardown_method(self):
        app.dependency_overrides.pop(get_cache_service, None)

    def test_store_then_lookup_returns_the_stored_response(self):
        store = self.client.post(
            "/security/cache", json={"prompt": "What is 2+2?", "response": "4"}
        )
        assert store.status_code == 200
        assert store.json()["cached"] is True

        lookup = self.client.post("/security/cache/lookup", json={"prompt": "What is 2+2?"})
        assert lookup.status_code == 200
        assert lookup.json() == {"hit": True, "response": "4"}

    def test_lookup_for_an_unseen_prompt_misses(self):
        lookup = self.client.post("/security/cache/lookup", json={"prompt": "never asked"})
        assert lookup.json() == {"hit": False, "response": None}

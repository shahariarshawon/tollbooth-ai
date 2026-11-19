import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_cache_service
from app.security.cache import CacheService, make_cache_key


def fake_cache_service() -> CacheService:
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    return CacheService(client=client)


class TestMakeCacheKey:
    def test_is_deterministic_for_the_same_prompt(self):
        assert make_cache_key("hello") == make_cache_key("hello")

    def test_differs_for_a_different_prompt(self):
        assert make_cache_key("hello") != make_cache_key("goodbye")

    def test_differs_for_different_tenants(self):
        key_a = make_cache_key("hello", tenant_id="tenant-a")
        key_b = make_cache_key("hello", tenant_id="tenant-b")
        assert key_a != key_b

    def test_differs_for_different_models(self):
        key_a = make_cache_key("hello", model="gpt-4o")
        key_b = make_cache_key("hello", model="claude-3-5-sonnet")
        assert key_a != key_b


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

    async def test_tenant_isolation_in_service(self):
        cache = fake_cache_service()
        await cache.set("prompt", "tenant A answer", tenant_id="tenant-a")
        await cache.set("prompt", "tenant B answer", tenant_id="tenant-b")

        assert await cache.get("prompt", tenant_id="tenant-a") == "tenant A answer"
        assert await cache.get("prompt", tenant_id="tenant-b") == "tenant B answer"


class TestCacheEndpoints:
    def setup_method(self):
        self.shared_cache = fake_cache_service()
        app.dependency_overrides[get_cache_service] = lambda: self.shared_cache
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

    def test_multitenant_cache_isolation_via_endpoints(self):
        # Tenant 1 stores response
        t1_store = self.client.post(
            "/security/cache",
            json={"prompt": "Secret query", "response": "Answer 1", "tenant_id": "tenant-1"},
        )
        assert t1_store.status_code == 200

        # Tenant 2 stores different response for same query
        t2_store = self.client.post(
            "/security/cache",
            json={"prompt": "Secret query", "response": "Answer 2", "tenant_id": "tenant-2"},
        )
        assert t2_store.status_code == 200

        # Tenant 1 lookup gets Answer 1
        t1_lookup = self.client.post(
            "/security/cache/lookup", json={"prompt": "Secret query", "tenant_id": "tenant-1"}
        )
        assert t1_lookup.json() == {"hit": True, "response": "Answer 1"}

        # Tenant 2 lookup gets Answer 2
        t2_lookup = self.client.post(
            "/security/cache/lookup", json={"prompt": "Secret query", "tenant_id": "tenant-2"}
        )
        assert t2_lookup.json() == {"hit": True, "response": "Answer 2"}

    def test_cache_metrics_endpoint(self):
        self.client.post("/security/cache/lookup", json={"prompt": "miss 1"})
        self.client.post("/security/cache", json={"prompt": "hit 1", "response": "resp"})
        self.client.post("/security/cache/lookup", json={"prompt": "hit 1"})

        metrics = self.client.get("/security/cache/metrics")
        assert metrics.status_code == 200
        data = metrics.json()
        assert data["hits"] == 1
        assert data["misses"] == 1
        assert data["hit_ratio"] == 0.5

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from llm.app import create_app


class FakeService:
    def __init__(self):
        self.calls = []

    def answer(self, message):
        self.calls.append(message)
        return {"reply": f"Answer to {message}", "sources": []}

    def ready(self):
        return True


@pytest.fixture
def service():
    return FakeService()


@pytest.fixture
def app(service):
    return create_app(
        {
            "TESTING": True,
            "RATELIMIT_ENABLED": False,
            "TRUSTED_HOSTS": ["localhost", "127.0.0.1"],
        },
        service,
    )


@pytest.mark.parametrize(
    "body",
    [
        None,
        [],
        [1],
        5,
        "test",
        {},
        {"message": None},
        {"message": 12},
        {"message": []},
        {"message": {}},
        {"message": "  "},
        {"message": "x" * 301},
    ],
)
def test_invalid_json_shape(app, service, body):
    response = app.test_client().post("/chat", json=body)
    assert response.status_code == 400
    assert response.is_json
    assert not service.calls


def test_body_limit(app):
    response = app.test_client().post(
        "/chat",
        data="x" * 17000,
        content_type="application/json",
    )
    assert response.status_code == 413
    assert response.is_json


def test_stateless_clients_ignore_history_fields(app, service):
    a, b = app.test_client(), app.test_client()
    assert a.post("/chat", json={"message": "A-private-marker"}).status_code == 200
    response = b.post(
        "/chat",
        json={
            "message": "B-question",
            "history": ["A-private-marker"],
            "session_id": "A",
        },
    )
    assert response.status_code == 200
    assert service.calls == ["A-private-marker", "B-question"]
    assert "A-private-marker" not in response.json["reply"]
    assert "Set-Cookie" not in response.headers


def test_request_ids_trim_and_no_store(app, service):
    client = app.test_client()
    first = client.post("/chat", json={"message": " hello "})
    second = client.post("/chat", json={"message": "hello"})
    assert service.calls == ["hello", "hello"]
    assert first.json["request_id"] == first.headers["X-Request-ID"]
    assert first.json["request_id"] != second.json["request_id"]
    assert first.headers["Cache-Control"] == "no-store"
    assert first.headers["X-Content-Type-Options"] == "nosniff"


def test_model_failure_returns_generic_error_and_releases_gate(app, service):
    original = service.answer

    def fail(_message):
        raise TimeoutError("Internal host and secret details")

    service.answer = fail
    response = app.test_client().post("/chat", json={"message": "hello"})
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "10"
    assert "secret" not in response.text.lower()

    service.answer = original
    assert app.test_client().post(
        "/chat", json={"message": "hello"}
    ).status_code == 200


def test_concurrency_gate_rejects_second_generation(app, service):
    entered, release = threading.Event(), threading.Event()

    def slow(_message):
        entered.set()
        release.wait(timeout=5)
        return {"reply": "ok"}

    service.answer = slow
    with ThreadPoolExecutor() as pool:
        first = pool.submit(
            lambda: app.test_client().post(
                "/chat", json={"message": "first"}
            )
        )
        assert entered.wait(timeout=2)
        try:
            assert app.test_client().post(
                "/chat", json={"message": "second"}
            ).status_code == 503
        finally:
            release.set()
        assert first.result().status_code == 200


def test_rate_limit(service):
    app = create_app(
        {
            "TESTING": True,
            "CHAT_LIMIT": "1/minute",
            "TRUSTED_HOSTS": ["localhost"],
        },
        service,
    )
    client = app.test_client()
    assert client.post("/chat", json={"message": "one"}).status_code == 200
    response = client.post("/chat", json={"message": "two"})
    assert response.status_code == 429
    assert response.is_json
    assert response.headers["Retry-After"] == "60"


def test_health_ready_cors_and_static_files(app, service):
    client = app.test_client()
    assert client.get("/health").json == {
        "status": "ok",
        "scope": "local-only",
        "history": "stateless",
    }
    assert client.get("/ready").status_code == 200
    service.ready = lambda: False
    assert client.get("/ready").status_code == 503

    allowed = client.options(
        "/chat",
        headers={
            "Origin": "http://localhost:5001",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert allowed.headers["Access-Control-Allow-Origin"] == "http://localhost:5001"

    denied = client.options(
        "/chat",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "Access-Control-Allow-Origin" not in denied.headers
    assert client.get("/static/.env").status_code == 404


def test_untrusted_host_is_rejected(app):
    response = app.test_client().get(
        "/health",
        headers={"Host": "untrusted.example"},
    )
    assert response.status_code == 400


def test_api_key_is_explicit_opt_in(service):
    key = "a-strong-local-test-key-123456789"
    protected = create_app(
        {
            "TESTING": True,
            "RATELIMIT_ENABLED": False,
            "TRUSTED_HOSTS": ["localhost"],
            "REQUIRE_API_KEY": True,
            "LOCAL_API_KEY": key,
        },
        service,
    )
    client = protected.test_client()
    assert client.post("/chat", json={"message": "hello"}).status_code == 401
    assert client.post(
        "/chat",
        json={"message": "hello"},
        headers={"X-Local-API-Key": key},
    ).status_code == 200

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
    return create_app({"TESTING": True, "RATELIMIT_ENABLED": False}, service)


@pytest.mark.parametrize("body", [None, [], [1], 5, "test", {}, {"message": None},
    {"message": 12}, {"message": []}, {"message": {}}, {"message": "  "}, {"message": "x" * 301}])
def test_invalid_json_shape(app, service, body):
    response = app.test_client().post('/chat', json=body)
    assert response.status_code == 400
    assert response.is_json
    assert not service.calls


def test_body_limit(app):
    response = app.test_client().post('/chat', data='x' * 17000, content_type='application/json')
    assert response.status_code == 413
    assert response.is_json


def test_stateless_clients_do_not_share_context(app, service):
    a, b = app.test_client(), app.test_client()
    assert a.post('/chat', json={"message": "A-private-marker"}).status_code == 200
    response = b.post('/chat', json={"message": "B-question", "history": ["A-private-marker"], "session_id": "A"})
    assert response.status_code == 200
    assert service.calls == ["A-private-marker", "B-question"]
    assert "A-private-marker" not in response.json['reply']
    assert 'Set-Cookie' not in response.headers


def test_request_ids_and_trim(app, service):
    client = app.test_client()
    a = client.post('/chat', json={"message": " hello "})
    b = client.post('/chat', json={"message": "hello"})
    assert service.calls == ['hello', 'hello']
    assert a.json['request_id'] == a.headers['X-Request-ID']
    assert a.json['request_id'] != b.json['request_id']
    assert a.headers['Cache-Control'] == 'no-store'


def test_model_failure_and_gate_release(app, service):
    original = service.answer
    def fail(message):
        raise TimeoutError('Internal host and secret details')
    service.answer = fail
    response = app.test_client().post('/chat', json={"message": "hello"})
    assert response.status_code == 503
    assert response.headers['Retry-After'] == '10'
    assert 'secret' not in response.text
    service.answer = original
    assert app.test_client().post('/chat', json={"message": "hello"}).status_code == 200


def test_concurrency_rejects_extra_generation(app, service):
    entered, release = threading.Event(), threading.Event()
    def slow(message):
        entered.set()
        release.wait(timeout=5)
        return {"reply": "ok"}
    service.answer = slow
    with ThreadPoolExecutor() as pool:
        first = pool.submit(lambda: app.test_client().post('/chat', json={"message": "first"}))
        assert entered.wait(timeout=2)
        try:
            assert app.test_client().post('/chat', json={"message": "second"}).status_code == 503
        finally:
            release.set()
        assert first.result().status_code == 200


def test_rate_limit(service):
    app = create_app({"TESTING": True, "CHAT_LIMIT": "1/minute"}, service)
    client = app.test_client()
    assert client.post('/chat', json={"message": "one"}).status_code == 200
    response = client.post('/chat', json={"message": "two"})
    assert response.status_code == 429
    assert response.is_json and response.headers['Retry-After'] == '60'


def test_health_ready_cors(app, service):
    client = app.test_client()
    assert client.get('/health').json == {"status": "ok", "history": "stateless"}
    assert client.get('/ready').status_code == 200
    service.ready = lambda: False
    assert client.get('/ready').status_code == 503
    allowed = client.options('/chat', headers={'Origin': 'http://localhost:5001', 'Access-Control-Request-Method': 'POST'})
    assert allowed.headers['Access-Control-Allow-Origin'] == 'http://localhost:5001'
    denied = client.options('/chat', headers={'Origin': 'https://untrusted.example', 'Access-Control-Request-Method': 'POST'})
    assert 'Access-Control-Allow-Origin' not in denied.headers


def test_no_public_static_backend(app):
    assert app.test_client().get('/static/.env').status_code == 404

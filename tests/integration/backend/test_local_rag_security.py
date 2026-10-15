"""RAG security regressions without loading a real embedding model."""
import logging
import sys
from types import SimpleNamespace

import pytest

from llm.app import create_app
from llm import indexer, retriever, vector_store


class FakeService:
    def ready(self):
        return True

    def answer(self, message):
        return {"reply": "ok", "sources": []}


def test_external_host_requires_key():
    with pytest.raises(RuntimeError, match="TRUSTED_HOSTS.*REQUIRE_API_KEY"):
        create_app({
            "TESTING": True,
            "TRUSTED_HOSTS": ["localhost", "sample.ngrok-free.app"],
        }, FakeService())


def test_external_frontend_requires_key():
    with pytest.raises(RuntimeError, match="FRONTEND_URLS.*REQUIRE_API_KEY"):
        create_app({
            "TESTING": True,
            "FRONTEND_URLS": "http://localhost:5001,https://example.test",
        }, FakeService())


def test_external_frontend_cannot_use_http_even_with_key():
    with pytest.raises(RuntimeError, match="HTTPS"):
        create_app({
            "TESTING": True,
            "FRONTEND_URLS": "http://remote.example.test",
            "REQUIRE_API_KEY": True,
            "LOCAL_API_KEY": "local-test-token-at-least-24-chars",
        }, FakeService())


def test_valid_tunnel_requires_key_on_chat_and_ready():
    protected = create_app({
        "TESTING": True,
        "RATELIMIT_ENABLED": False,
        "TRUSTED_HOSTS": ["localhost", "sample.ngrok-free.app"],
        "REQUIRE_API_KEY": True,
        "LOCAL_API_KEY": "local-test-token-at-least-24-chars",
        "PUBLIC_ONLY_MODE": True,
    }, FakeService())
    client = protected.test_client()
    assert client.post("/chat", json={"message": "hi"}).status_code == 401
    assert client.get("/ready").status_code == 401
    assert client.post(
        "/chat",
        json={"message": "hi"},
        headers={"X-Local-API-Key": "local-test-token-at-least-24-chars"},
    ).status_code == 200


def test_legacy_pickle_is_never_deserialized(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, "META_PATH", tmp_path / "meta.json")
    monkeypatch.setattr(vector_store, "LEGACY_META_PATH", tmp_path / "meta.pkl")
    (tmp_path / "meta.pkl").write_bytes(b"malicious-object")
    with pytest.raises(ValueError, match="pickle"):
        vector_store.load_index()


def test_retriever_skips_invalid_faiss_id_and_never_logs_chunks(monkeypatch, caplog):
    private_text = "PRIVATE-RAG-CHUNK-CONTENT"
    class Index:
        ntotal = 2
        def search(self, embeddings, k):
            return [[0.2, 0.4]], [[-1, 0]]
    fake = retriever.Retriever.__new__(retriever.Retriever)
    fake.index = Index()
    fake.chunks = [
        {"id": "one", "doc_id": "local", "text": private_text},
        {"id": "two", "doc_id": "local", "text": "public"},
    ]
    monkeypatch.setitem(
        sys.modules,
        "llm.embedder",
        SimpleNamespace(model=SimpleNamespace(encode=lambda *a, **kw: [[1]])),
    )
    with caplog.at_level(logging.INFO):
        result = fake.retrieve("tell me about projects", top_k=2)
    assert len(result) == 1
    assert result[0]["text"] == private_text
    assert private_text not in caplog.text


def test_missing_knowledge_fails_index_build(tmp_path, monkeypatch):
    monkeypatch.setattr(indexer, "KB_PATH", tmp_path)
    with pytest.raises(ValueError, match="No local knowledge"):
        indexer.rebuild_index()
    assert indexer.main() == 1


def test_model_read_timeout_default_and_owner_override(monkeypatch):
    """Slow local Ollama inference must have a bounded, configurable allowance."""
    monkeypatch.delenv("MODEL_TIMEOUT", raising=False)
    normal = create_app({"TESTING": True}, FakeService())
    assert normal.config["MODEL_TIMEOUT"] == 120.0

    monkeypatch.setenv("MODEL_TIMEOUT", "180")
    configured = create_app({"TESTING": True}, FakeService())
    assert configured.config["MODEL_TIMEOUT"] == 180.0


def test_public_only_cannot_start_without_backend_key():
    with pytest.raises(RuntimeError, match="PUBLIC_ONLY_MODE requires"):
        create_app({
            "TESTING": True, "PUBLIC_ONLY_MODE": True,
            "REQUIRE_API_KEY": False,
        }, FakeService())


def test_external_host_cannot_serve_private_corpus_even_with_key():
    with pytest.raises(RuntimeError, match="Non-local access requires PUBLIC_ONLY_MODE"):
        create_app({
            "TESTING": True,
            "TRUSTED_HOSTS": ["localhost", "test.ngrok-free.app"],
            "REQUIRE_API_KEY": True,
            "LOCAL_API_KEY": "local-test-token-at-least-24-chars",
        }, FakeService())


def test_public_only_service_uses_curated_in_memory_retriever_not_private_index(monkeypatch):
    import threading
    from llm.app import LocalPortfolioService
    import llm.public_retriever as public
    import llm.retriever as private

    class FakePublicRetriever:
        index = SimpleNamespace(ntotal=5)

    monkeypatch.setattr(public, "PublicCatalogueRetriever", FakePublicRetriever)
    monkeypatch.setattr(private, "Retriever", lambda: pytest.fail(
        "Private mixed FAISS index must never be loaded in public mode"
    ))
    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service.public_only = True
    service._retriever_lock = threading.Lock()
    service._retriever_instance = None
    retriever_instance = service._retriever()
    assert retriever_instance.index.ntotal == 5
    assert service._retriever() is retriever_instance


def test_public_retriever_index_sources_are_only_approved_catalogue(monkeypatch):
    import sys
    import llm.public_retriever as public
    from llm.public_knowledge import load_public_documents
    expected_docs = load_public_documents()

    class FakeIndex:
        def __init__(self, dimension):
            self.d = dimension
            self.ntotal = 0
        def add(self, vector):
            self.ntotal = len(vector)

    monkeypatch.setitem(sys.modules, "faiss", SimpleNamespace(IndexFlatL2=FakeIndex))
    class FakeArray(list):
        @property
        def ndim(self):
            return 2
        @property
        def shape(self):
            return len(self), len(self[0])
    monkeypatch.setitem(sys.modules, "numpy", SimpleNamespace(
        float32="float32",
        ascontiguousarray=lambda data, dtype: FakeArray(data),
    ))
    monkeypatch.setitem(sys.modules, "llm.embedder", SimpleNamespace(
        embed_chunks=lambda chunks: [[1.0, 2.0] for _ in chunks]
    ))
    instance = public.PublicCatalogueRetriever()
    assert instance.index.ntotal == len(instance.chunks)
    approved_ids = {doc["id"] for doc in expected_docs}
    assert {chunk["doc_id"] for chunk in instance.chunks} == approved_ids
    assert all("path" not in chunk for chunk in instance.chunks)


def test_public_global_rate_limit_blocks_different_remote_ips():
    secret = "local-test-token-at-least-24-chars"
    app = create_app({
        "TESTING": True, "PUBLIC_ONLY_MODE": True,
        "REQUIRE_API_KEY": True, "LOCAL_API_KEY": secret,
        "CHAT_LIMIT": "1/minute", "TRUSTED_HOSTS": ["localhost"],
    }, FakeService())
    client = app.test_client()
    headers = {"X-Local-API-Key": secret}
    first = client.post("/chat", json={"message": "first"},
                        headers=headers,
                        environ_overrides={"REMOTE_ADDR": "198.51.100.8"})
    second = client.post("/chat", json={"message": "second"},
                         headers=headers,
                         environ_overrides={"REMOTE_ADDR": "203.0.113.9"})
    assert first.status_code == 200
    assert second.status_code == 429

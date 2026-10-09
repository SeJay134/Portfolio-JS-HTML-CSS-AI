"""RAG security regressions without loading a real embedding model."""
import json
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


def test_json_metadata_must_match_index_count(tmp_path, monkeypatch):
    chunks = [{"id": "one", "doc_id": "local", "text": "safe content"}]
    meta = tmp_path / "meta.json"
    meta.write_text(json.dumps(chunks), encoding="utf-8")
    monkeypatch.setattr(vector_store, "META_PATH", meta)
    monkeypatch.setattr(vector_store, "INDEX_PATH", tmp_path / "index.faiss")
    monkeypatch.setitem(
        sys.modules,
        "faiss",
        SimpleNamespace(read_index=lambda _: SimpleNamespace(ntotal=2, d=384)),
    )
    with pytest.raises(ValueError, match="do not match"):
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

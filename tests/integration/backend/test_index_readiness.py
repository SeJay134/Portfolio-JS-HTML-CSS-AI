"""Readiness must use the active snapshot, not pre-generation root paths."""
from types import SimpleNamespace

from llm import app as local_app
from llm import vector_store


def _service(public_only=False, model_present=True):
    service = local_app.LocalPortfolioService.__new__(local_app.LocalPortfolioService)
    service.public_only = public_only
    service.model = "model-for-test"
    service.health_client = SimpleNamespace(
        list=lambda: SimpleNamespace(models=[
            SimpleNamespace(model="model-for-test" if model_present else "other-model")
        ])
    )
    return service


def test_readiness_accepts_valid_generation_without_legacy_root_files(
    tmp_path, monkeypatch,
):
    """Regression: a valid active.json must not depend on old root files."""
    monkeypatch.setattr(local_app, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(vector_store, "load_index", lambda: (
        SimpleNamespace(d=2, ntotal=1),
        [{"id": "a", "doc_id": "b", "text": "evidence"}],
    ))
    assert _service().ready() is True


def test_readiness_rejects_failed_active_index(monkeypatch):
    def invalid_index():
        raise ValueError("invalid active generation")

    monkeypatch.setattr(vector_store, "load_index", invalid_index)
    assert _service().ready() is False


def test_readiness_checks_ollama_model_even_after_index_load(monkeypatch):
    monkeypatch.setattr(vector_store, "load_index", lambda: (
        SimpleNamespace(d=2, ntotal=1), [{"id": "a", "doc_id": "b", "text": "x"}],
    ))
    assert _service(model_present=False).ready() is False


def test_public_only_readiness_does_not_open_private_faiss(monkeypatch):
    def private_index():
        raise AssertionError("private index must not be accessed")

    monkeypatch.setattr(vector_store, "load_index", private_index)
    service = _service(public_only=True)
    service._retriever = lambda: SimpleNamespace(index=SimpleNamespace(ntotal=1))
    assert service.ready() is True

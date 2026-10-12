"""Public RAG provenance regressions without running Ollama/FAISS."""
from types import SimpleNamespace

import pytest

from llm.public_knowledge import (
    load_public_documents, public_overview, trusted_source,
)
from llm.splitter import split_text
from llm.app import LocalPortfolioService


def test_verified_catalogue_lists_four_canonical_projects():
    docs = load_public_documents()
    overview = public_overview()
    assert len(docs) == 5
    for title in (
        "Chocolate sales dashboard",
        "GDP dashboard",
        "Open API weather explorer",
        "Portfolio website & AI prototype",
    ):
        assert title in overview


def test_generated_chunk_retains_verified_source_only():
    docs = load_public_documents()
    chunks = split_text(docs)
    assert chunks
    verified = chunks[0]
    assert trusted_source(verified["doc_id"], verified["source"]) == {
        "title": "Portfolio projects",
        "url": "https://sergei-luna.vercel.app/#Projects",
    }
    injected = split_text([
        {"id": "private-doc.md", "text": "Private data with https://github.com/ fake reference"}
    ])[0]
    assert "source" not in injected
    assert trusted_source(injected["doc_id"], injected.get("source")) is None
    assert trusted_source("private-doc.md", {
        "title": "Fake", "url": "https://github.com/SeJay134"
    }) is None
    assert trusted_source("verified-projects-overview", {
        "title": "Portfolio projects", "url": "file:///C:/private/data/base.txt"
    }) is None


def test_generation_receives_public_catalogue_and_exposes_only_trusted_sources():
    docs = load_public_documents()
    class FakeRetriever:
        index = SimpleNamespace(ntotal=3)
        def retrieve(self, message, top_k):
            return [
                {
                    "doc_id": docs[1]["id"],
                    "text": docs[1]["text"],
                    "source": docs[1]["source"],
                },
                {
                    "doc_id": "private-notes.md",
                    "text": "Private notes about work.",
                    "source": {"title": "Leak", "url": "https://github.com/SeJay134"},
                },
            ]

    captured = []
    class FakeClient:
        def chat(self, **kwargs):
            captured.append(kwargs)
            return {"message": {"content": "Chocolate sales dashboard"}}

    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service._retriever = lambda: FakeRetriever()
    service.client = FakeClient()
    service.model = "test-model"
    result = service.answer("Which projects?")
    assert result["reply"] == "Chocolate sales dashboard"
    assert result["sources"] == [docs[1]["source"]]
    prompt = captured[0]["messages"][1]["content"]
    assert "Chocolate sales dashboard" in prompt
    assert "GDP dashboard" in prompt
    assert "Open API weather explorer" in prompt
    assert "Portfolio website & AI prototype" in prompt
    assert "private-notes.md" not in str(result)


def test_bad_public_catalogue_source_rejected(tmp_path, monkeypatch):
    import llm.public_knowledge as public
    invalid = {"schema_version": 1, "projects": [
        {
            "id": "chocolate",
            "title": "Chocolate sales dashboard", "summary": "text",
            "detail": "text", "category": "Data",
            "tags": ["Python"], "repository": "https://github.com.evil.example/x"
        }
    ] * 4}
    dest = tmp_path / "catalog.json"
    dest.write_text(__import__("json").dumps(invalid))
    monkeypatch.setattr(public, "CATALOG_PATH", dest)
    with pytest.raises(ValueError):
        public.load_public_documents()

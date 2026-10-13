"""Public RAG provenance regressions without running Ollama/FAISS."""
from types import SimpleNamespace

import pytest

from llm.public_knowledge import (
    load_public_documents, public_overview, trusted_source,
    sources_for_mentioned_projects, unlisted_project_reply, response_language,
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


def test_exact_project_mentions_have_reviewed_links_without_public_faiss_hits():
    docs = load_public_documents()
    answer = "\n".join(doc["source"]["title"] for doc in docs[1:])
    trusted = sources_for_mentioned_projects(answer)
    assert trusted == [doc["source"] for doc in docs[1:]]
    assert sources_for_mentioned_projects("Data analysis solutions only") == []
    assert sources_for_mentioned_projects(
        "Fake project with https://github.com.evil.example/project"
    ) == []


def test_generation_links_named_projects_even_when_only_private_notes_retrieved():
    docs = load_public_documents()
    class PrivateOnlyRetriever:
        index = SimpleNamespace(ntotal=1)
        def retrieve(self, message, top_k):
            return [{"doc_id": "notes.txt", "text": "generic notes about data",
                     "source": {"title": "Attack", "url": "https://evil.example"}}]

    class FakeClient:
        def chat(self, **kwargs):
            return {"message": {"content": "\n".join(
                doc["source"]["title"] for doc in docs[1:]
            )}}

    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service._retriever = lambda: PrivateOnlyRetriever()
    service.client = FakeClient()
    service.model = "test-model"

    result = service.answer("What projects has Sergei built?")
    assert result["sources"] == [doc["source"] for doc in docs[1:]]
    assert "Attack" not in str(result)
    assert "evil.example" not in str(result)


@pytest.mark.parametrize("question", [
    "Как называется пятый опубликованный проект Сергея и где его GitHub?",
    "Какие технологии в пятом проекте?",
    "Расскажи о 5-м опубликованном проекте.",
    "What is the fifth published project?",
    "Tell me about the 5th public project.",
    "Where is project 5?",
])
def test_unlisted_project_returns_grounded_fallback_without_sources_or_ollama(question):
    class NoGeneration:
        def chat(self, **kwargs):
            pytest.fail("Unlisted ordinal should not call Ollama")

    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service._retriever = lambda: pytest.fail("Unlisted ordinal should not query FAISS")
    service.client = NoGeneration()
    service.model = "test-model"
    result = service.answer(question)
    assert result["sources"] == []
    assert "4" in result["reply"]
    if response_language(question) == "Russian":
        assert "проект" in result["reply"]
        assert "информации" in result["reply"].casefold()
    else:
        assert "no information" in result["reply"].lower()


def test_ordinal_guard_is_scoped_and_does_not_override_known_projects():
    assert unlisted_project_reply("Расскажи о четвёртом проекте") is None
    assert unlisted_project_reply("What is the 4th project?") is None
    assert unlisted_project_reply("What is Sergei's fifth favorite movie?") is None
    assert unlisted_project_reply("What are 5 technologies used by this project?") is None


def test_retrieved_public_chunk_does_not_automatically_become_a_source():
    project = load_public_documents()[1]
    class PublicRetriever:
        index = SimpleNamespace(ntotal=1)
        def retrieve(self, message, top_k):
            return [{"doc_id": project["id"], "text": project["text"],
                     "source": project["source"]}]

    class FakeClient:
        def chat(self, **kwargs):
            return {"message": {"content": (
                "I do not have that information. Please use Contact."
            )}}

    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service._retriever = lambda: PublicRetriever()
    service.client = FakeClient()
    service.model = "test-model"
    result = service.answer("What is Sergei's favorite movie?")
    assert result["sources"] == []
    assert "github.com" not in str(result)


def test_russian_question_uses_same_grounded_prompt_and_verified_sources():
    project = load_public_documents()[1]
    class PublicRetriever:
        index = SimpleNamespace(ntotal=1)
        def retrieve(self, message, top_k):
            return [{"doc_id": project["id"], "text": project["text"],
                     "source": project["source"]}]

    captured = []
    class FakeClient:
        def chat(self, **kwargs):
            captured.append(kwargs)
            return {"message": {"content": (
                "В проекте Chocolate sales dashboard использованы "
                "Python, Streamlit, Pandas и Plotly."
            )}}

    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service._retriever = lambda: PublicRetriever()
    service.client = FakeClient()
    service.model = "test-model"
    result = service.answer("Какие технологии использованы? Ответь по-русски.")
    assert len(captured) == 1
    assert "Answer in the language of the current question" in captured[0]["messages"][0]["content"]
    assert "Response language: Russian." not in captured[0]["messages"][0]["content"]
    assert "Technologies: Python, Streamlit, Pandas, Plotly" in captured[0]["messages"][1]["content"]
    assert result["sources"] == [project["source"]]
    assert "рус" not in result["sources"][0]["url"]

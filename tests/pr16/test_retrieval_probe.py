"""Retrieval diagnostics record only counts, not private chunk contents."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from retrieval_probe import probe


def test_probe_reports_public_match_without_chunk_text():
    class Retriever:
        def retrieve(self, question, top_k=3):
            return [{"doc_id": "verified-project-api", "text": "PRIVATE",
                     "score": 0.5, "source": {"url": "https://secret.example"}}]
    output = probe(Retriever(), {
        "id": "PUB-API-1", "question": "Weather API",
        "expected_doc_ids": ["verified-project-api"],
    })
    assert output == {
        "id": "PUB-API-1", "attempted": True,
        "expected_hit": True, "retrieved_count": 1, "best_distance": 0.5
    }
    assert "PRIVATE" not in str(output)
    assert "secret" not in str(output)


def test_probe_empty_expected_does_not_touch_retriever():
    class Retriever:
        def retrieve(self, question, top_k=3):
            raise AssertionError("Retrieval must not be used.")
    result = probe(Retriever(), {
        "id": "NEG-1", "question": "?", "expected_doc_ids": []
    })
    assert result["attempted"] is False
    assert result["expected_hit"] is None

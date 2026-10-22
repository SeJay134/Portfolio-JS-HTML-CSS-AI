"""Read-only PUBLIC FAISS retrieval diagnosis; never save document text."""
from __future__ import annotations


def probe(retriever, case: dict) -> dict:
    """Return only public expected-hit metadata, never chunk/source contents."""
    if not case.get("expected_doc_ids"):
        return {"id": case["id"], "attempted": False, "expected_hit": None,
                "retrieved_count": 0}
    hits = retriever.retrieve(case["question"], top_k=3)
    expected = set(case["expected_doc_ids"])
    observed = {hit.get("doc_id") for hit in hits}
    return {
        "id": case["id"],
        "attempted": True,
        "expected_hit": bool(expected & observed),
        "retrieved_count": len(hits),
        "best_distance": round(float(hits[0]["score"]), 3)
        if hits and isinstance(hits[0].get("score"), (int, float)) else None,
    }

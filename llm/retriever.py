"""Local FAISS retrieval without logging document text or questions."""
from __future__ import annotations


class Retriever:
    def __init__(self):
        from llm.vector_store import load_index

        self.index, self.chunks = load_index()

    def retrieve(self, query: str, top_k: int = 1) -> list[dict]:
        if not isinstance(query, str) or not query.strip():
            return []
        count = int(getattr(self.index, "ntotal", 0))
        k = max(0, min(int(top_k), count, len(self.chunks)))
        if k == 0:
            return []

        from llm.embedder import model

        embeddings = model.encode([query], convert_to_numpy=True)
        distances, ids = self.index.search(embeddings, k)
        results = []
        for idx, distance in zip(ids[0], distances[0]):
            index_id = int(idx)
            if index_id < 0 or index_id >= len(self.chunks):
                continue
            chunk = self.chunks[index_id]
            if not isinstance(chunk, dict) or not isinstance(chunk.get("text"), str):
                continue
            results.append({
                "id": chunk.get("id"),
                "doc_id": chunk.get("doc_id"),
                "text": chunk["text"],
                "score": float(distance),
            })
        return results

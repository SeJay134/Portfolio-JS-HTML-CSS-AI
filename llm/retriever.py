"""Retrieve bounded portfolio evidence; FAISS distances are not confidence scores."""
import os


class Retriever:
    def __init__(self, index=None, chunks=None, encoder=None):
        if index is None:
            from llm.vector_store import load_index
            index, chunks = load_index()
        if encoder is None:
            from llm.embedder import get_model
            encoder = get_model()
        self.index, self.chunks, self.encoder = index, chunks, encoder
        # This initial threshold is inherited, not a calibrated accuracy claim.
        self.threshold = float(os.getenv("RAG_MAX_DISTANCE", "1.4"))

    def retrieve(self, query, top_k=3):
        if top_k <= 0 or self.index.ntotal <= 0 or not self.chunks:
            return []
        vectors = self.encoder.encode([query], convert_to_numpy=True)
        distances, ids = self.index.search(vectors, min(top_k, self.index.ntotal))
        results = []
        for i, distance in zip(ids[0], distances[0]):
            if not 0 <= int(i) < len(self.chunks) or not float(distance) <= self.threshold:
                continue
            results.append({**self.chunks[int(i)], "score": float(distance)})
        return results

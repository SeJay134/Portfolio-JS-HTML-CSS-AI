# llm/retriever.py

import numpy as np
from llm.vector_store import load_index
from llm.embedder import model
import logging
# logger = logging.getLogger(__name__)
from llm.dec_logging import logger
class Retriever:
    def __init__(self):
        self.index, self.chunks = load_index()
    @logger
    def retrieve(self, query, top_k=1):
        # logging.info('retriever retrieve was invoked')
        q_emb = model.encode([query], convert_to_numpy=True) # Кодирует запрос
        distances, ids = self.index.search(q_emb, top_k) # Ищет похожие embeddings

        logging.info(
            "Retriever distance=%s",
            distances[0][0]
        )

        results = []
        for i, dist in zip(ids[0], distances[0]):
            chunk = self.chunks[i] # Собирает результаты
            results.append({
                "id": chunk["id"],
                "doc_id": chunk["doc_id"],
                "text": chunk["text"],
                "score": float(dist),
        })
            
        for r in results:
            logging.info("Chunk:\n%s", r["text"])

        return results # возвращает список:
# [
#     {"text": "...", "score": 0.78},
#     ...
# ]


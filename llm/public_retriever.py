"""In-memory FAISS retriever restricted to the reviewed PUBLIC catalogue.

This path never opens data/base/, the owner's mixed index.faiss/meta.json, or
private source files. Use only with PUBLIC_ONLY_MODE=true for a public tunnel.
"""
from __future__ import annotations

from llm.retriever import Retriever


class PublicCatalogueRetriever(Retriever):
    def __init__(self):
        import faiss
        import numpy as np
        from llm.embedder import embed_chunks
        from llm.public_knowledge import load_public_documents
        from llm.splitter import split_text

        self.chunks = split_text(load_public_documents())
        if not self.chunks:
            raise ValueError("Reviewed public catalogue contains no RAG chunks.")

        vector = np.ascontiguousarray(embed_chunks(self.chunks), dtype=np.float32)
        if vector.ndim != 2 or vector.shape[0] != len(self.chunks) or vector.shape[1] < 1:
            raise ValueError("Public catalogue embeddings are invalid.")
        self.index = faiss.IndexFlatL2(vector.shape[1])
        self.index.add(vector)

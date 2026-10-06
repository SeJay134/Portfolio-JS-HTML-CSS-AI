# llm/vector_store.py

import faiss # pip install faiss-cpu
import numpy as np
import os
import pickle
from llm.dec_logging import logger
import logging

INDEX_PATH = "data/embeddings/index.faiss"
META_PATH = "data/embeddings/meta.pkl"

@logger
def save_index(chunks, embeddings):
    os.makedirs("data/embeddings/", exist_ok=True)

    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim) # L2 distance, "score": float(dist), расстояние less = better; больше = хуже.
    index.add(embeddings)

    logging.info(
        "FAISS index created: %s | dimension=%s | vectors=%s",
        type(index).__name__,
        index.d,
        index.ntotal
    )

    if index.d != embeddings.shape[1]:
        raise ValueError("Dimension mismatch")

    faiss.write_index(index, INDEX_PATH)

    with open(META_PATH, "wb") as f:
        pickle.dump(chunks, f)

    print(f"[VECTOR_STORE] Saved {len(chunks)} chunks, dim={dim}")

@logger
def load_index():
    index = faiss.read_index(INDEX_PATH)
    with open(META_PATH, "rb") as f:
        chunks = pickle.load(f)
    return index, chunks

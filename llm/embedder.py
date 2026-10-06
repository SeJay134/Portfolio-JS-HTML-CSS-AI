"""Load the embedding model only when indexing or retrieval is requested."""
from functools import lru_cache


@lru_cache(maxsize=1)
def get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


def embed_chunks(chunks):
    return get_model().encode([c["text"] for c in chunks], convert_to_numpy=True)

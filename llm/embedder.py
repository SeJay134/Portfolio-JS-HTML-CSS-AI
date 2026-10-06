# llm/embedder.py

from sentence_transformers import SentenceTransformer
import logging
logger = logging.getLogger(__name__)

model = SentenceTransformer("all-MiniLM-L6-v2")

def embed_chunks(chunks):
    logging.info('embedder embed_chunks was invoked')
    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, convert_to_numpy=True)
    return embeddings

# pip install -U sentence-transformers
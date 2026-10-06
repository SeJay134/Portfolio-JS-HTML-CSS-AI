# llm/indexer.py
"""
indexer rebuilds indexes in RAG
"""

import os
from llm.loader import load_documents
from llm.splitter import split_text
from llm.embedder import embed_chunks
from llm.vector_store import save_index
from llm.validator import validate_index

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

KB_PATH = "data/base/"

def rebuild_index():
    logging.info(f'llm/indexer.py rebuild_index() was invoked')
    try:
        print("[INDEXER] rebuilds indexes...")

        docs = load_documents(KB_PATH)
        logging.debug(f'llm/indexer.py rebuild_index() docs = {docs}')

        if not docs:
            print(f'indexer.py no docs')
            logging.warning(f'llm/indexer.py rebuild_index() docs not found')

        chunks = split_text(docs)
        embeddings = embed_chunks(chunks)

        if len(chunks) != len(embeddings):
            raise ValueError("Chunks and embeddings count mismatch")
        
        print(f"[INDEXER] Loaded {len(docs)} documents")
        print(f"[INDEXER] Created {len(chunks)} chunks")

        save_index(chunks, embeddings)
        validate_index()

        print("[INDEXER] index updated")

    except Exception as e:
        print("[INDEXER] ERROR:", e)

if __name__ == "__main__":
    rebuild_index()

# python -m llm.indexer

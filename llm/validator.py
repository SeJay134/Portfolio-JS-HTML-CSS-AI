# llm/validator.py
"""
validator checks index
"""

import os
import faiss

INDEX_PATH = "data/embeddings/index.faiss"

def validate_index():
    print("[VALIDATOR] checking index...")

    if not os.path.exists(INDEX_PATH):
        print("[VALIDATOR] ❌ index missed")
        return False

    # check file size
    if os.path.getsize(INDEX_PATH) < 100:
        print("[VALIDATOR] ❌ index file too small")
        return False

    try:
        index = faiss.read_index(INDEX_PATH)
    except Exception as e:
        print("[VALIDATOR] ❌ cannot load index:", e)
        return False

    # check vector dimension
    if index.d <= 0:
        print("[VALIDATOR] ❌ invalid vector dimension")
        return False

    # check number of vectors
    if index.ntotal == 0:
        print("[VALIDATOR] ❌ index is empty")
        return False

    print(f"[VALIDATOR] ✔ index passed ({index.ntotal} vectors, dim={index.d})")
    return True

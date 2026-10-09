"""Validate the local index and safe JSON metadata."""
from __future__ import annotations


def validate_index() -> bool:
    try:
        from llm.vector_store import load_index

        index, chunks = load_index()
        return bool(chunks) and index.d > 0 and index.ntotal == len(chunks)
    except (OSError, ValueError, RuntimeError, ImportError):
        return False

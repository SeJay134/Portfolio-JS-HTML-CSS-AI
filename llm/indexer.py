"""Build a local RAG index from owner-provided data/base/*.txt or *.md."""
from __future__ import annotations

import logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
KB_PATH = PROJECT_ROOT / "data" / "base"
log = logging.getLogger(__name__)


def rebuild_index() -> None:
    from llm.loader import load_documents

    docs = load_documents(str(KB_PATH))
    if not docs:
        raise ValueError(
            "No local knowledge documents found in data/base/. "
            "Add reviewed .txt or .md files before indexing."
        )

    from llm.splitter import split_text

    chunks = split_text(docs)
    if not chunks:
        raise ValueError("Local knowledge documents are empty.")

    from llm.embedder import embed_chunks
    from llm.vector_store import save_index

    embeddings = embed_chunks(chunks)
    if len(chunks) != len(embeddings):
        raise ValueError("Chunk count and embedding count differ.")
    save_index(chunks, embeddings)

    from llm.validator import validate_index

    if not validate_index():
        raise RuntimeError("Index validation failed.")


def main() -> int:
    try:
        rebuild_index()
    except Exception as exc:
        # Avoid logging source content or generating a success exit on failure.
        log.error("Local index build failed: %s", type(exc).__name__)
        return 1
    print("[INDEXER] Index built and validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

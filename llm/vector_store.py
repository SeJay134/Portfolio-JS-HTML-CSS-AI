"""Save/load local FAISS vectors with JSON metadata, never pickle."""
from __future__ import annotations

import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STORE_DIR = PROJECT_ROOT / "data" / "embeddings"
INDEX_PATH = STORE_DIR / "index.faiss"
META_PATH = STORE_DIR / "meta.json"
LEGACY_META_PATH = STORE_DIR / "meta.pkl"


def _valid_chunks(chunks) -> bool:
    return isinstance(chunks, list) and all(
        isinstance(chunk, dict)
        and isinstance(chunk.get("id"), str)
        and isinstance(chunk.get("doc_id"), str)
        and isinstance(chunk.get("text"), str)
        for chunk in chunks
    )


def save_index(chunks, embeddings) -> None:
    import faiss
    import numpy as np

    if not _valid_chunks(chunks) or not chunks:
        raise ValueError("Cannot index an empty or invalid knowledge source.")

    array = np.ascontiguousarray(embeddings, dtype=np.float32)
    if array.ndim != 2 or array.shape[1] < 1 or array.shape[0] != len(chunks):
        raise ValueError("Chunk count and embedding dimensions must match.")

    index = faiss.IndexFlatL2(array.shape[1])
    index.add(array)
    STORE_DIR.mkdir(parents=True, exist_ok=True)

    # Write both temporary files before publishing; inconsistent pairs
    # are rejected by load_index() rather than loaded silently.
    with TemporaryDirectory(prefix=".rebuild-", dir=STORE_DIR) as temp_dir:
        index_temp = Path(temp_dir) / "index.faiss"
        meta_temp = Path(temp_dir) / "meta.json"
        faiss.write_index(index, str(index_temp))
        meta_temp.write_text(
            json.dumps(chunks, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(index_temp, INDEX_PATH)
        os.replace(meta_temp, META_PATH)


def load_index():
    if not META_PATH.is_file():
        if LEGACY_META_PATH.is_file():
            raise ValueError(
                "Legacy pickle metadata is disabled for safety. "
                "Rebuild the index with python -m llm.indexer."
            )
        raise FileNotFoundError("Local RAG index metadata not found. Rebuild the index.")

    try:
        chunks = json.loads(META_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON RAG metadata.") from exc

    if not _valid_chunks(chunks):
        raise ValueError("Invalid RAG metadata structure.")

    import faiss

    index = faiss.read_index(str(INDEX_PATH))
    if int(index.d) <= 0 or int(index.ntotal) != len(chunks):
        raise ValueError("FAISS vectors do not match JSON metadata.")
    return index, chunks

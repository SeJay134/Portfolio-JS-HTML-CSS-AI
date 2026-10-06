"""Atomically publish a versioned index and JSON metadata via a manifest."""
import json
import os
import uuid
from pathlib import Path

from llm.paths import INDEX_DIR


def save_index(chunks, embeddings):
    import faiss
    import numpy as np
    if not chunks or len(chunks) != len(embeddings):
        raise ValueError("A nonempty, matching set of chunks and embeddings is required")
    vectors = np.asarray(embeddings, dtype="float32")
    if vectors.ndim != 2 or vectors.shape[1] != 384 or not np.isfinite(vectors).all():
        raise ValueError("Invalid embeddings")
    if any(not isinstance(chunk, dict) or not isinstance(chunk.get("text"), str) or not chunk["text"].strip() for chunk in chunks):
        raise ValueError("Invalid evidence metadata")
    index = faiss.IndexFlatL2(vectors.shape[1])
    index.add(vectors)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    version = uuid.uuid4().hex
    faiss.write_index(index, str(INDEX_DIR / f"{version}.faiss"))
    (INDEX_DIR / f"{version}.json").write_text(json.dumps(chunks), encoding="utf-8")
    temp = INDEX_DIR / f"{version}.manifest.tmp"
    temp.write_text(json.dumps({"version": version, "model": "all-MiniLM-L6-v2"}), encoding="utf-8")
    os.replace(temp, INDEX_DIR / "manifest.json")


def load_index():
    import faiss
    manifest = json.loads((INDEX_DIR / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if len(version) != 32 or any(c not in "0123456789abcdef" for c in version):
        raise ValueError("Invalid index manifest")
    if manifest.get("model") != "all-MiniLM-L6-v2":
        raise ValueError("Embedding model mismatch; rebuild the index")
    index = faiss.read_index(str(INDEX_DIR / f"{version}.faiss"))
    chunks = json.loads((INDEX_DIR / f"{version}.json").read_text(encoding="utf-8"))
    if not isinstance(chunks, list) or index.ntotal != len(chunks) or not chunks or index.d != 384:
        raise ValueError("Invalid or mismatched index metadata")
    if any(not isinstance(chunk, dict) or not isinstance(chunk.get("text"), str) or not chunk["text"].strip() for chunk in chunks):
        raise ValueError("Invalid evidence metadata")
    return index, chunks

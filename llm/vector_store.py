"""Publish immutable FAISS/JSON snapshots through one atomic manifest switch."""
from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STORE_DIR = PROJECT_ROOT / "data" / "embeddings"
# Old files are recognized only to provide an explicit migration error.
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


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_synced(path: Path, data: bytes) -> None:
    with path.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


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
    index_bytes = faiss.serialize_index(index).tobytes()
    meta_bytes = json.dumps(chunks, ensure_ascii=False).encode("utf-8")
    generation = f"gen-{uuid.uuid4().hex}"
    manifest = {
        "schema_version": 1,
        "generation": generation,
        "index_sha256": _digest(index_bytes),
        "metadata_sha256": _digest(meta_bytes),
    }
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".rebuild-", dir=STORE_DIR) as temp_dir:
        staging = Path(temp_dir)
        snapshot = staging / "snapshot"
        snapshot.mkdir()
        _write_synced(snapshot / "index.faiss", index_bytes)
        _write_synced(snapshot / "meta.json", meta_bytes)
        # Each writer owns a unique immutable directory; readers never open it
        # until the manifest is published. All renames stay on one filesystem.
        os.replace(snapshot, STORE_DIR / generation)
        pointer = staging / "current.json"
        _write_synced(pointer, json.dumps(manifest).encode("utf-8"))
        os.replace(pointer, STORE_DIR / "current.json")
    # Retain previous/orphan generations: a reader may still be using one.
    # Concurrent writers are safe; the last successful manifest switch wins.


def load_index():
    import faiss
    import numpy as np

    try:
        # Read the pointer exactly once. Never combine two manifest versions.
        manifest_bytes = (STORE_DIR / "current.json").read_bytes()
    except FileNotFoundError:
        if LEGACY_META_PATH.is_file():
            raise ValueError(
                "Legacy pickle metadata is disabled. Rebuild with python -m llm.indexer."
            ) from None
        if INDEX_PATH.exists() or META_PATH.exists():
            raise ValueError(
                "Legacy two-file index cannot be verified. "
                "Rebuild with python -m llm.indexer and restart Flask."
            ) from None
        raise FileNotFoundError(
            "Local RAG snapshot not found. Rebuild with python -m llm.indexer."
        ) from None

    try:
        manifest = json.loads(manifest_bytes)
        if (
            not isinstance(manifest, dict)
            or manifest.get("schema_version") != 1
            or not isinstance(manifest.get("generation"), str)
            or re.fullmatch(r"gen-[0-9a-f]{32}", manifest["generation"]) is None
            or any(
                not isinstance(manifest.get(key), str)
                or re.fullmatch(r"[0-9a-f]{64}", manifest[key]) is None
                for key in ("index_sha256", "metadata_sha256")
            )
        ):
            raise ValueError("Invalid RAG snapshot manifest.")
        snapshot = STORE_DIR / manifest["generation"]
        index_bytes = (snapshot / "index.faiss").read_bytes()
        meta_bytes = (snapshot / "meta.json").read_bytes()
        if (
            _digest(index_bytes) != manifest["index_sha256"]
            or _digest(meta_bytes) != manifest["metadata_sha256"]
        ):
            raise ValueError("RAG snapshot checksum mismatch. Rebuild the index.")
        chunks = json.loads(meta_bytes)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid or incomplete RAG snapshot. Rebuild the index.") from exc

    if not _valid_chunks(chunks) or not chunks:
        raise ValueError("Invalid RAG metadata structure.")
    # Deserialize the exact bytes whose checksum was verified, not a second
    # read of a file that might have changed in the meantime.
    index = faiss.deserialize_index(np.frombuffer(index_bytes, dtype=np.uint8))
    if int(index.d) <= 0 or int(index.ntotal) != len(chunks):
        raise ValueError("FAISS vectors do not match JSON metadata.")
    return index, chunks

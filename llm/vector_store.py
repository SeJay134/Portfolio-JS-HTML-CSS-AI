"""Save/load local FAISS vectors with JSON metadata, never pickle."""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from uuid import uuid4

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STORE_DIR = PROJECT_ROOT / "data" / "embeddings"
INDEX_PATH = STORE_DIR / "index.faiss"
META_PATH = STORE_DIR / "meta.json"
LEGACY_META_PATH = STORE_DIR / "meta.pkl"
# Each generation is immutable. Only the small pointer is replaced atomically.
ACTIVE_PATH = STORE_DIR / "active.json"
VERSIONS_DIR = STORE_DIR / "versions"
_VERSION_RE = re.compile(r"[0-9a-f]{32}\Z")


def _valid_chunks(chunks) -> bool:
    return isinstance(chunks, list) and all(
        isinstance(chunk, dict)
        and isinstance(chunk.get("id"), str)
        and isinstance(chunk.get("doc_id"), str)
        and isinstance(chunk.get("text"), str)
        for chunk in chunks
    )


def _read_pair(index_path: Path, meta_path: Path):
    if not meta_path.is_file():
        if meta_path == META_PATH and LEGACY_META_PATH.is_file():
            raise ValueError(
                "Legacy pickle metadata is disabled for safety. "
                "Rebuild the index with python -m llm.indexer."
            )
        raise FileNotFoundError("Local RAG index metadata not found. Rebuild the index.")

    try:
        chunks = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON RAG metadata.") from exc

    if not _valid_chunks(chunks):
        raise ValueError("Invalid RAG metadata structure.")

    import faiss

    index = faiss.read_index(str(index_path))
    if int(index.d) <= 0 or int(index.ntotal) != len(chunks):
        raise ValueError("FAISS vectors do not match JSON metadata.")
    return index, chunks


def _read_verified_pair(index_path: Path, meta_path: Path, pointer: dict):
    """Deserialize the exact bytes authenticated by the v2 active pointer."""
    import faiss
    import numpy as np

    try:
        index_bytes = index_path.read_bytes()
        meta_bytes = meta_path.read_bytes()
    except OSError as exc:
        raise ValueError("Missing or incomplete active RAG snapshot.") from exc

    if (hashlib.sha256(index_bytes).hexdigest() != pointer["index_sha256"]
            or hashlib.sha256(meta_bytes).hexdigest() != pointer["metadata_sha256"]):
        raise ValueError("RAG snapshot checksum mismatch. Rebuild the index.")

    try:
        chunks = json.loads(meta_bytes)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON RAG metadata.") from exc
    if not _valid_chunks(chunks) or not chunks:
        raise ValueError("Invalid RAG metadata structure.")

    # Do not reopen the file after verification: using the same bytes prevents
    # a replacement between the checksum and FAISS deserialization.
    index = faiss.deserialize_index(np.frombuffer(index_bytes, dtype=np.uint8))
    if int(index.d) <= 0 or int(index.ntotal) != len(chunks):
        raise ValueError("FAISS vectors do not match JSON metadata.")
    return index, chunks


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

    # A failed build cannot modify the generation selected by ACTIVE_PATH.
    # Keep older generations so in-flight readers remain safe during an update.
    version = uuid4().hex
    version_dir = VERSIONS_DIR / version
    version_dir.mkdir(parents=True, exist_ok=False)
    staged_pointer = STORE_DIR / f".active-{version}.json"
    try:
        index_path = version_dir / "index.faiss"
        meta_path = version_dir / "meta.json"
        faiss.write_index(index, str(index_path))
        meta_path.write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")

        # Verify the whole pair before making the generation visible to readers.
        written_index, written_chunks = _read_pair(index_path, meta_path)
        if int(written_index.d) != int(index.d) or written_chunks != chunks:
            raise ValueError("Saved RAG index verification failed.")

        # Preserve the active pointer format and version directory layout used
        # by existing installations. New v2 pointers authenticate both files.
        # The previous v1 pointer remains readable for migration in place.
        index_digest = hashlib.sha256(index_path.read_bytes()).hexdigest()
        metadata_digest = hashlib.sha256(meta_path.read_bytes()).hexdigest()
        staged_pointer.write_text(json.dumps({
            "schema_version": 2,
            "version": version,
            "index_sha256": index_digest,
            "metadata_sha256": metadata_digest,
        }), encoding="utf-8")
        os.replace(staged_pointer, ACTIVE_PATH)
    finally:
        staged_pointer.unlink(missing_ok=True)


def load_index():
    if ACTIVE_PATH.exists():
        try:
            pointer = json.loads(ACTIVE_PATH.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ValueError("Invalid active RAG index pointer.") from exc
        if not isinstance(pointer, dict):
            raise ValueError("Invalid active RAG index pointer.")
        version = pointer.get("version")
        if not isinstance(version, str) or not _VERSION_RE.fullmatch(version):
            raise ValueError("Invalid active RAG index pointer.")
        version_dir = VERSIONS_DIR / version
        index_path = version_dir / "index.faiss"
        meta_path = version_dir / "meta.json"
        # V1: historical pointer containing only {"version": uuid}.
        # V2: SHA-256 hashes and an explicit version. Partial/unknown schemas
        # are rejected; never downgrade a broken V2 pointer to V1.
        if set(pointer) == {"version"}:
            return _read_pair(index_path, meta_path)
        if (set(pointer) != {
            "schema_version", "version", "index_sha256", "metadata_sha256"
        } or type(pointer["schema_version"]) is not int
                or pointer["schema_version"] != 2
                or any(not isinstance(pointer[key], str)
                       or re.fullmatch(r"[0-9a-f]{64}", pointer[key]) is None
                       for key in ("index_sha256", "metadata_sha256"))):
            raise ValueError("Invalid active RAG index pointer.")
        return _read_verified_pair(index_path, meta_path, pointer)

    # Existing installations may still have the old pair. The next successful
    # indexing run migrates to immutable generations without deleting local data.
    return _read_pair(INDEX_PATH, META_PATH)

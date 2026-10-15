"""Real FAISS regressions for interrupted publication and snapshot integrity."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace

import numpy as np
import pytest

from llm import vector_store as store
from llm.app import LocalPortfolioService


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STORE_DIR", tmp_path)
    for name, filename in (
        ("INDEX_PATH", "index.faiss"), ("META_PATH", "meta.json"),
        ("LEGACY_META_PATH", "meta.pkl"),
    ):
        monkeypatch.setattr(store, name, tmp_path / filename)


def publish(label, value):
    store.save_index(
        [{"id": label, "doc_id": label, "text": f"Evidence {label}"}],
        np.array([[value, value + 1]], dtype=np.float32),
    )


def loaded():
    index, chunks = store.load_index()
    return chunks[0]["id"], float(index.reconstruct(0)[0])


def manifest():
    return json.loads((store.STORE_DIR / "current.json").read_bytes())


def test_round_trip_and_readiness_without_legacy_root_files():
    publish("first", 1)
    assert loaded() == ("first", 1)
    assert not store.INDEX_PATH.exists()
    assert not store.META_PATH.exists()
    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service.public_only = False
    service.model = "test-model"
    service.health_client = SimpleNamespace(list=lambda: SimpleNamespace(
        models=[SimpleNamespace(model="test-model")],
    ))
    assert service.ready() is True
    publish("second", 20)
    assert loaded() == ("second", 20)
    assert len(list(store.STORE_DIR.glob("gen-*"))) == 2


@pytest.mark.parametrize("failure", ["metadata", "generation", "manifest", "switch"])
def test_interrupted_rebuild_keeps_previous_equal_count_pair(monkeypatch, failure):
    publish("old", 1)
    original_pointer = (store.STORE_DIR / "current.json").read_bytes()
    real_write, real_replace = store._write_synced, store.os.replace

    def write(path, data):
        if ((failure == "metadata" and path.name == "meta.json")
                or (failure == "manifest" and path.name == "current.json")):
            raise OSError("Simulated interrupted write")
        return real_write(path, data)

    def replace(src, dst):
        if ((failure == "generation" and Path(src).name == "snapshot")
                or (failure == "switch" and Path(dst).name == "current.json")):
            raise OSError("Simulated interrupted rename")
        return real_replace(src, dst)

    monkeypatch.setattr(store, "_write_synced", write)
    monkeypatch.setattr(store.os, "replace", replace)
    with pytest.raises(OSError, match="Simulated"):
        publish("new", 20)
    assert (store.STORE_DIR / "current.json").read_bytes() == original_pointer
    assert loaded() == ("old", 1)


def test_reader_pins_manifest_when_writer_publishes_during_read(monkeypatch):
    publish("old", 1)
    real_read = Path.read_bytes
    switched = False

    def read(path):
        nonlocal switched
        data = real_read(path)
        if path == store.STORE_DIR / "current.json" and not switched:
            switched = True
            publish("new", 20)
        return data

    monkeypatch.setattr(Path, "read_bytes", read)
    assert loaded() == ("old", 1)
    assert loaded() == ("new", 20)


def test_concurrent_writers_publish_whole_pairs(monkeypatch):
    publish("old", 1)
    barrier = Barrier(2)
    real_replace = store.os.replace

    def replace(src, dst):
        if Path(dst).name == "current.json":
            barrier.wait(timeout=10)
        return real_replace(src, dst)

    monkeypatch.setattr(store.os, "replace", replace)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(publish, "a", 10), pool.submit(publish, "b", 20)]
        for future in futures:
            future.result(timeout=15)
    assert loaded() in {("a", 10), ("b", 20)}


@pytest.mark.parametrize("filename", ["index.faiss", "meta.json"])
def test_same_count_cross_generation_file_is_rejected(filename):
    publish("old", 1)
    old_dir = store.STORE_DIR / manifest()["generation"]
    publish("new", 20)
    new_dir = store.STORE_DIR / manifest()["generation"]
    (new_dir / filename).write_bytes((old_dir / filename).read_bytes())
    with pytest.raises(ValueError, match="checksum mismatch"):
        store.load_index()


def test_metadata_count_validation_remains_after_checksum_validation():
    publish("old", 1)
    pointer = manifest()
    path = store.STORE_DIR / pointer["generation"] / "meta.json"
    chunks = json.loads(path.read_bytes()) * 2
    data = json.dumps(chunks).encode()
    path.write_bytes(data)
    pointer["metadata_sha256"] = hashlib.sha256(data).hexdigest()
    (store.STORE_DIR / "current.json").write_text(json.dumps(pointer))
    with pytest.raises(ValueError, match="do not match"):
        store.load_index()


@pytest.mark.parametrize("value", ["../outside", "/tmp/outside", "gen-invalid"])
def test_manifest_cannot_select_arbitrary_paths(value):
    publish("old", 1)
    pointer = manifest()
    pointer["generation"] = value
    (store.STORE_DIR / "current.json").write_text(json.dumps(pointer))
    with pytest.raises(ValueError, match="manifest"):
        store.load_index()


@pytest.mark.parametrize("failure", ["invalid-json", "missing-file"])
def test_broken_snapshot_never_falls_back_to_legacy(failure):
    publish("old", 1)
    store.META_PATH.write_text("[]")
    store.INDEX_PATH.write_bytes(b"legacy")
    if failure == "invalid-json":
        (store.STORE_DIR / "current.json").write_text("{")
    else:
        (store.STORE_DIR / manifest()["generation"] / "meta.json").unlink()
    with pytest.raises(ValueError, match="incomplete"):
        store.load_index()


def test_legacy_json_pair_requires_rebuild_and_is_not_modified():
    store.META_PATH.write_text("[]")
    store.INDEX_PATH.write_bytes(b"old index")
    with pytest.raises(ValueError, match="Legacy two-file"):
        store.load_index()
    assert store.INDEX_PATH.read_bytes() == b"old index"
    publish("migrated", 4)
    assert loaded() == ("migrated", 4)
    assert store.INDEX_PATH.read_bytes() == b"old index"


def test_first_publication_failure_leaves_no_readable_snapshot(monkeypatch):
    real_replace = store.os.replace

    def replace(src, dst):
        if Path(dst).name == "current.json":
            raise OSError("Simulated interrupted first publication")
        return real_replace(src, dst)

    monkeypatch.setattr(store.os, "replace", replace)
    with pytest.raises(OSError):
        publish("first", 1)
    with pytest.raises(FileNotFoundError, match="snapshot not found"):
        store.load_index()

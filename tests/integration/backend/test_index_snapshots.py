"""Real FAISS regressions for the existing active.json generation protocol.

All writes are contained in pytest's tmp_path. No owner data, Ollama
download, credentials, or private embedding model are used.
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import faiss
import numpy as np
import pytest

from llm import vector_store as store
from llm.app import LocalPortfolioService


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STORE_DIR", tmp_path)
    monkeypatch.setattr(store, "ACTIVE_PATH", tmp_path / "active.json")
    monkeypatch.setattr(store, "VERSIONS_DIR", tmp_path / "versions")
    monkeypatch.setattr(store, "INDEX_PATH", tmp_path / "index.faiss")
    monkeypatch.setattr(store, "META_PATH", tmp_path / "meta.json")
    monkeypatch.setattr(store, "LEGACY_META_PATH", tmp_path / "meta.pkl")


def sample(name):
    return [{"id": name, "doc_id": name, "text": "Evidence " + name}]


def publish(name, value):
    store.save_index(sample(name), np.array([[value, value + 1]], dtype=np.float32))


def loaded():
    index, chunks = store.load_index()
    return chunks[0]["id"], float(index.reconstruct(0)[0])


def pointer():
    return json.loads(store.ACTIVE_PATH.read_text(encoding="utf-8"))


def test_real_faiss_round_trip_without_root_files():
    publish("first", 1)
    assert loaded() == ("first", 1.0)
    assert pointer()["schema_version"] == 2
    assert not store.INDEX_PATH.exists() and not store.META_PATH.exists()


def test_readiness_accepts_real_active_index_without_root_files():
    publish("ready", 2)
    service = LocalPortfolioService.__new__(LocalPortfolioService)
    service.public_only = False
    service.model = "model-for-test"
    service.health_client = type("Health", (), {
        "list": lambda self: type("Result", (), {
            "models": [type("Model", (), {"model": "model-for-test"})()]
        })()
    })()
    assert service.ready() is True
    (store.VERSIONS_DIR / pointer()["version"] / "meta.json").unlink()
    assert service.ready() is False


def test_old_v1_active_pointer_remains_readable_and_migrates():
    publish("v1", 1)
    version = pointer()["version"]
    store.ACTIVE_PATH.write_text(json.dumps({"version": version}), encoding="utf-8")
    assert loaded() == ("v1", 1.0)
    publish("v2", 3)
    assert loaded() == ("v2", 3.0)
    assert pointer()["schema_version"] == 2


def test_root_legacy_pair_still_readable_without_active_pointer():
    store.STORE_DIR.mkdir(parents=True, exist_ok=True)
    index = faiss.IndexFlatL2(2)
    index.add(np.array([[5, 6]], dtype=np.float32))
    faiss.write_index(index, str(store.INDEX_PATH))
    store.META_PATH.write_text(json.dumps(sample("legacy")), encoding="utf-8")
    assert loaded() == ("legacy", 5.0)
    publish("new", 7)
    assert loaded() == ("new", 7.0)
    assert store.INDEX_PATH.is_file() and store.META_PATH.is_file()


@pytest.mark.parametrize("filename", ["index.faiss", "meta.json"])
def test_cross_generation_substitution_with_same_count_is_rejected(filename):
    publish("first", 1)
    old_path = store.VERSIONS_DIR / pointer()["version"]
    publish("second", 2)
    new_path = store.VERSIONS_DIR / pointer()["version"]
    assert (old_path / filename).read_bytes() != (new_path / filename).read_bytes()
    (new_path / filename).write_bytes((old_path / filename).read_bytes())
    with pytest.raises(ValueError, match="checksum mismatch"):
        store.load_index()


def test_verified_bytes_are_exactly_what_faiss_deserializes(monkeypatch):
    publish("safe", 1)
    import faiss as real_faiss
    original = real_faiss.deserialize_index
    called = []

    def deserialize(data):
        called.append(bytes(data))
        return original(data)

    monkeypatch.setattr(real_faiss, "deserialize_index", deserialize)
    assert loaded() == ("safe", 1.0)
    active = store.VERSIONS_DIR / pointer()["version"] / "index.faiss"
    assert called == [active.read_bytes()]


@pytest.mark.parametrize("malformed", [
    '{"version": "../../outside"}',
    '{"version": "/tmp/outside"}',
    '{"version": "bad"}',
    '{"version": "a" * 32}',
    '{"schema_version": 2, "version": "a" * 32}',
    'null',
    '{',
])
def test_broken_pointer_fails_closed_without_legacy_fallback(malformed):
    publish("good", 1)
    store.ACTIVE_PATH.write_text(malformed, encoding="utf-8")
    store.META_PATH.write_text(json.dumps(sample("legacy")), encoding="utf-8")
    store.INDEX_PATH.write_bytes(b"not a real legacy index")
    with pytest.raises((ValueError, json.JSONDecodeError)):
        store.load_index()


def test_same_count_but_modified_metadata_even_if_structurally_valid_is_rejected():
    publish("safe", 1)
    meta = store.VERSIONS_DIR / pointer()["version"] / "meta.json"
    meta.write_text(json.dumps(sample("substituted")), encoding="utf-8")
    with pytest.raises(ValueError, match="checksum mismatch"):
        store.load_index()


def test_digest_and_count_are_both_validated():
    publish("safe", 1)
    active = pointer()
    meta = store.VERSIONS_DIR / active["version"] / "meta.json"
    duplicated = sample("safe") * 2
    content = json.dumps(duplicated).encode("utf-8")
    meta.write_bytes(content)
    active["metadata_sha256"] = hashlib.sha256(content).hexdigest()
    store.ACTIVE_PATH.write_text(json.dumps(active), encoding="utf-8")
    with pytest.raises(ValueError, match="do not match"):
        store.load_index()


def test_partial_v2_manifest_is_not_silently_treated_as_v1():
    publish("safe", 1)
    active = pointer()
    del active["metadata_sha256"]
    store.ACTIVE_PATH.write_text(json.dumps(active), encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid active"):
        store.load_index()


def test_interrupted_publish_preserves_previous_pointer_and_data(monkeypatch):
    publish("before", 1)
    before = store.ACTIVE_PATH.read_bytes()
    real_replace = store.os.replace

    def interrupt(source, dest):
        if dest == store.ACTIVE_PATH:
            raise OSError("interrupted publication")
        return real_replace(source, dest)

    monkeypatch.setattr(store.os, "replace", interrupt)
    with pytest.raises(OSError, match="interrupted"):
        publish("after", 2)
    assert store.ACTIVE_PATH.read_bytes() == before
    assert loaded() == ("before", 1.0)


def test_reader_during_publication_sees_old_complete_generation(monkeypatch):
    publish("old", 1)
    entered, resume = Event(), Event()
    original = store.os.replace

    def pause_pointer(source, dest):
        if dest == store.ACTIVE_PATH:
            entered.set()
            if not resume.wait(10):
                raise TimeoutError("test synchronization failed")
        return original(source, dest)

    monkeypatch.setattr(store.os, "replace", pause_pointer)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(publish, "new", 9)
        try:
            assert entered.wait(10), "writer did not reach publication"
            assert loaded() == ("old", 1.0)
        finally:
            resume.set()
        future.result(timeout=10)
    assert loaded() == ("new", 9.0)


def test_concurrent_writers_publish_one_whole_generation():
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda pair: publish(*pair), [("alpha", 2), ("beta", 8)]))
    result = loaded()
    assert result in [("alpha", 2.0), ("beta", 8.0)]
    active = pointer()
    version = store.VERSIONS_DIR / active["version"]
    for filename, field in [("index.faiss", "index_sha256"), ("meta.json", "metadata_sha256")]:
        assert hashlib.sha256((version / filename).read_bytes()).hexdigest() == active[field]

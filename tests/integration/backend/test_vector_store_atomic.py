"""Regression tests: a crash during a rebuild never publishes a mixed FAISS pair."""
import json
import os
import sys
from types import SimpleNamespace

import pytest

from llm import vector_store


class FakeArray(list):
    ndim = 2

    @property
    def shape(self):
        return len(self), len(self[0])


class FakeIndex:
    def __init__(self, dimension):
        self.d = dimension
        self.ntotal = 0
        self.vectors = []

    def add(self, values):
        self.vectors = list(values)
        self.ntotal = len(values)


@pytest.fixture
def fake_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, "STORE_DIR", tmp_path)
    monkeypatch.setattr(vector_store, "ACTIVE_PATH", tmp_path / "active.json")
    monkeypatch.setattr(vector_store, "VERSIONS_DIR", tmp_path / "versions")
    monkeypatch.setattr(vector_store, "INDEX_PATH", tmp_path / "index.faiss")
    monkeypatch.setattr(vector_store, "META_PATH", tmp_path / "meta.json")
    monkeypatch.setattr(vector_store, "LEGACY_META_PATH", tmp_path / "meta.pkl")

    def write_index(index, path):
        with open(path, "w", encoding="utf-8") as file:
            json.dump({"d": index.d, "vectors": index.vectors}, file)

    def read_index(path):
        with open(path, encoding="utf-8") as file:
            data = json.load(file)
        index = FakeIndex(data["d"])
        index.add(data["vectors"])
        return index

    monkeypatch.setitem(sys.modules, "faiss", SimpleNamespace(
        IndexFlatL2=FakeIndex,
        write_index=write_index,
        read_index=read_index,
    ))
    monkeypatch.setitem(sys.modules, "numpy", SimpleNamespace(
        float32="float32",
        ascontiguousarray=lambda values, dtype: FakeArray(values),
    ))
    return tmp_path


def sample(text):
    return [{"id": "1", "doc_id": "doc", "text": text}]


def test_publishes_complete_generation_without_replacing_legacy_files(fake_storage):
    vector_store.save_index(sample("before"), [[1.0, 2.0]])
    first_pointer = json.loads(vector_store.ACTIVE_PATH.read_text())
    index, chunks = vector_store.load_index()
    assert (index.vectors, chunks) == ([[1.0, 2.0]], sample("before"))

    vector_store.save_index(sample("after"), [[9.0, 8.0]])
    second_pointer = json.loads(vector_store.ACTIVE_PATH.read_text())
    assert first_pointer != second_pointer
    index, chunks = vector_store.load_index()
    assert (index.vectors, chunks) == ([[9.0, 8.0]], sample("after"))
    assert (vector_store.VERSIONS_DIR / first_pointer["version"] / "meta.json").is_file()
    assert not vector_store.INDEX_PATH.exists()
    assert not vector_store.META_PATH.exists()


def test_failure_after_writing_index_keeps_previous_generation(fake_storage, monkeypatch):
    vector_store.save_index(sample("before"), [[1.0, 2.0]])
    before = vector_store.ACTIVE_PATH.read_bytes()
    original_write = type(vector_store.META_PATH).write_text

    def fail_new_metadata(self, *args, **kwargs):
        if self.name == "meta.json" and "versions" in self.parts:
            raise OSError("Simulated crash after FAISS write")
        return original_write(self, *args, **kwargs)

    monkeypatch.setattr(type(vector_store.META_PATH), "write_text", fail_new_metadata)
    with pytest.raises(OSError, match="Simulated crash"):
        vector_store.save_index(sample("after"), [[9.0, 8.0]])
    assert vector_store.ACTIVE_PATH.read_bytes() == before
    index, chunks = vector_store.load_index()
    assert (index.vectors, chunks) == ([[1.0, 2.0]], sample("before"))


def test_failure_during_pointer_swap_keeps_previous_generation(fake_storage, monkeypatch):
    vector_store.save_index(sample("before"), [[1.0, 2.0]])
    before = vector_store.ACTIVE_PATH.read_bytes()
    original_replace = os.replace

    def fail_pointer_swap(source, dest):
        if dest == vector_store.ACTIVE_PATH:
            raise OSError("Simulated crash during publication")
        return original_replace(source, dest)

    monkeypatch.setattr(vector_store.os, "replace", fail_pointer_swap)
    with pytest.raises(OSError, match="Simulated crash"):
        vector_store.save_index(sample("after"), [[9.0, 8.0]])
    assert vector_store.ACTIVE_PATH.read_bytes() == before
    index, chunks = vector_store.load_index()
    assert (index.vectors, chunks) == ([[1.0, 2.0]], sample("before"))


def test_invalid_pointer_never_falls_back_to_legacy_pair(fake_storage):
    vector_store.save_index(sample("before"), [[1.0, 2.0]])
    vector_store.ACTIVE_PATH.write_text('{"version": "../../legacy"}', encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid active"):
        vector_store.load_index()


def test_missing_versioned_metadata_fails_closed(fake_storage):
    vector_store.save_index(sample("before"), [[1.0, 2.0]])
    pointer = json.loads(vector_store.ACTIVE_PATH.read_text())
    meta_path = vector_store.VERSIONS_DIR / pointer["version"] / "meta.json"
    meta_path.unlink()
    with pytest.raises(FileNotFoundError, match="metadata not found"):
        vector_store.load_index()


def test_legacy_pair_still_loads_when_pointer_absent(fake_storage):
    fake_storage.joinpath("index.faiss").write_text(
        json.dumps({"d": 2, "vectors": [[4.0, 3.0]]}), encoding="utf-8"
    )
    vector_store.META_PATH.write_text(json.dumps(sample("legacy")), encoding="utf-8")
    index, chunks = vector_store.load_index()
    assert (index.vectors, chunks) == ([[4.0, 3.0]], sample("legacy"))

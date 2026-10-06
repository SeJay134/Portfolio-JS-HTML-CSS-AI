import json
import pytest

np = pytest.importorskip('numpy')
pytest.importorskip('faiss')
from llm import vector_store


def test_roundtrip_and_atomic_publication(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, 'INDEX_DIR', tmp_path)
    chunks = [{'id': 'a', 'text': 'First evidence'}]
    vector_store.save_index(chunks, np.zeros((1, 384), dtype='float32'))
    first_manifest = json.loads((tmp_path / 'manifest.json').read_text())
    index, metadata = vector_store.load_index()
    assert index.ntotal == 1 and metadata == chunks
    second = [{'id': 'b', 'text': 'New evidence'}]
    vector_store.save_index(second, np.ones((1, 384), dtype='float32'))
    assert vector_store.load_index()[1] == second
    assert (tmp_path / f"{first_manifest['version']}.faiss").exists()


def test_invalid_embeddings_do_not_replace_active_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, 'INDEX_DIR', tmp_path)
    vector_store.save_index([{'text': 'ok'}], np.zeros((1,384)))
    before = (tmp_path / 'manifest.json').read_bytes()
    with pytest.raises(ValueError):
        vector_store.save_index([], [])
    assert (tmp_path / 'manifest.json').read_bytes() == before


def test_mismatched_metadata_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, 'INDEX_DIR', tmp_path)
    vector_store.save_index([{'text': 'ok'}], np.zeros((1,384)))
    manifest = json.loads((tmp_path / 'manifest.json').read_text())
    (tmp_path / f"{manifest['version']}.json").write_text('[]')
    with pytest.raises(ValueError):
        vector_store.load_index()


def test_wrong_embedding_dimension_keeps_previous_index(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, 'INDEX_DIR', tmp_path)
    vector_store.save_index([{'text': 'ok'}], np.zeros((1,384)))
    before = (tmp_path / 'manifest.json').read_bytes()
    with pytest.raises(ValueError):
        vector_store.save_index([{'text': 'bad dimension'}], np.zeros((1,128)))
    assert (tmp_path / 'manifest.json').read_bytes() == before

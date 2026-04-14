"""Embedding/indexing tests for the ChromaDB policy corpus."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.config import settings
from app.evidence import rag_embeddings
from app.evidence.rag_ingest import DocumentChunk


def test_client_creates_chroma_directory_and_uses_persistent_client(monkeypatch):
    chroma_dir = Path("tests/.tmp_rag_embeddings/chroma")
    if chroma_dir.parent.exists():
        shutil.rmtree(chroma_dir.parent)
    captured: dict[str, str] = {}
    fake_client = object()

    def _persistent_client(*, path: str):
        captured["path"] = path
        return fake_client

    monkeypatch.setattr(rag_embeddings.chromadb, "PersistentClient", _persistent_client)

    client = rag_embeddings._client(chroma_dir)

    assert client is fake_client
    assert chroma_dir.exists()
    assert chroma_dir.is_dir()
    assert captured["path"] == str(chroma_dir)

    shutil.rmtree(chroma_dir.parent)


def test_embedding_fn_requires_openai_api_key(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "", raising=False)

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY must be set"):
        rag_embeddings._embedding_fn()


def test_get_collection_creates_cms_policy_collection(monkeypatch):
    calls: list[dict] = []
    embedding_function = object()
    collection = object()

    class _FakeClient:
        def get_or_create_collection(self, **kwargs):
            calls.append(kwargs)
            return collection

    monkeypatch.setattr(rag_embeddings, "_client", lambda chroma_dir=None: _FakeClient())
    monkeypatch.setattr(rag_embeddings, "_embedding_fn", lambda: embedding_function)

    result = rag_embeddings.get_collection(Path("ignored"))

    assert result is collection
    assert calls == [
        {
            "name": rag_embeddings.COLLECTION_NAME,
            "embedding_function": embedding_function,
            "metadata": {"model": rag_embeddings.EMBEDDING_MODEL},
        }
    ]


def test_index_chunks_batches_upserts_and_normalizes_metadata(monkeypatch):
    upserts: list[dict] = []

    class _FakeCollection:
        def upsert(self, *, ids, documents, metadatas):
            upserts.append(
                {
                    "ids": list(ids),
                    "documents": list(documents),
                    "metadatas": list(metadatas),
                }
            )

    monkeypatch.setattr(rag_embeddings, "get_collection", lambda: _FakeCollection())

    total = rag_embeddings.index_chunks(
        [
            DocumentChunk(
                chunk_id="doc__0001",
                text="alpha text",
                source="alpha.md",
                chapter=None,
                section="1.1",
                topic=None,
            ),
            DocumentChunk(
                chunk_id="doc__0002",
                text="beta text",
                source="beta.md",
                chapter="12",
                section=None,
                topic="billing",
            ),
            DocumentChunk(
                chunk_id="doc__0003",
                text="gamma text",
                source="gamma.md",
                chapter="13",
                section="2.4",
                topic="coding",
            ),
        ],
        batch_size=2,
    )

    assert total == 3
    assert len(upserts) == 2
    assert upserts[0]["ids"] == ["doc__0001", "doc__0002"]
    assert upserts[0]["metadatas"] == [
        {
            "source": "alpha.md",
            "chapter": "",
            "section": "1.1",
            "topic": "",
        },
        {
            "source": "beta.md",
            "chapter": "12",
            "section": "",
            "topic": "billing",
        },
    ]
    assert upserts[1]["ids"] == ["doc__0003"]
    assert upserts[1]["documents"] == ["gamma text"]


def test_collection_size_returns_count(monkeypatch):
    class _FakeCollection:
        def count(self):
            return 7

    monkeypatch.setattr(rag_embeddings, "get_collection", lambda chroma_dir=None: _FakeCollection())

    assert rag_embeddings.collection_size(Path("ignored")) == 7

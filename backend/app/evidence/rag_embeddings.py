"""ChromaDB embedding and indexing using OpenAI text-embedding-3-small.

Single collection `cms_policy` with per-chunk metadata (source/chapter/section/topic).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

from app.config import settings
from app.evidence.rag_ingest import DocumentChunk

logger = logging.getLogger(__name__)

COLLECTION_NAME = "cms_policy"
EMBEDDING_MODEL = "text-embedding-3-small"


def _client(chroma_dir: Path | None = None) -> chromadb.ClientAPI:
    path = chroma_dir or settings.CHROMA_DIR
    path.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(path))


def _embedding_fn() -> OpenAIEmbeddingFunction:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY must be set to index the policy corpus")
    return OpenAIEmbeddingFunction(
        api_key=settings.OPENAI_API_KEY,
        model_name=EMBEDDING_MODEL,
    )


def get_collection(chroma_dir: Path | None = None) -> chromadb.Collection:
    """Get or create the cms_policy collection."""
    client = _client(chroma_dir)
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=_embedding_fn(),
        metadata={"model": EMBEDDING_MODEL},
    )


def index_chunks(chunks: Iterable[DocumentChunk], batch_size: int = 100) -> int:
    """Embed and index document chunks. Returns number of chunks indexed."""
    collection = get_collection()
    batch_ids: list[str] = []
    batch_docs: list[str] = []
    batch_meta: list[dict] = []
    total = 0

    def flush() -> None:
        nonlocal total
        if not batch_ids:
            return
        collection.upsert(ids=batch_ids, documents=batch_docs, metadatas=batch_meta)
        total += len(batch_ids)
        batch_ids.clear()
        batch_docs.clear()
        batch_meta.clear()

    for chunk in chunks:
        batch_ids.append(chunk.chunk_id)
        batch_docs.append(chunk.text)
        batch_meta.append(
            {
                "source": chunk.source,
                "chapter": chunk.chapter or "",
                "section": chunk.section or "",
                "topic": chunk.topic or "",
            }
        )
        if len(batch_ids) >= batch_size:
            flush()
    flush()

    logger.info("Indexed %d chunks into collection %s", total, COLLECTION_NAME)
    return total


def collection_size(chroma_dir: Path | None = None) -> int:
    """Return current document count in the cms_policy collection."""
    try:
        return get_collection(chroma_dir).count()
    except Exception as exc:  # pragma: no cover
        logger.warning("Could not read collection size: %s", exc)
        return 0

"""Semantic RAG retriever with metadata-filtered search over cms_policy collection."""

from __future__ import annotations

import logging
from typing import Any

from app.data.schemas.evidence import PolicyCitation
from app.evidence.rag_embeddings import get_collection

logger = logging.getLogger(__name__)


def _build_where(filters: dict[str, Any] | None) -> dict[str, Any] | None:
    if not filters:
        return None
    clean = {k: v for k, v in filters.items() if v not in (None, "")}
    return clean or None


def retrieve(
    query: str,
    top_k: int = 5,
    filters: dict[str, Any] | None = None,
) -> list[PolicyCitation]:
    """Retrieve top-k policy chunks for the given query.

    Args:
        query: Free-text question.
        top_k: Number of chunks to return.
        filters: Optional metadata filter (e.g. {"source": "cms_claims_manual"}).
    """
    if not query or not query.strip():
        return []

    collection = get_collection()
    where = _build_where(filters)

    try:
        result = collection.query(
            query_texts=[query],
            n_results=top_k,
            where=where,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("RAG query failed: %s", exc)
        return []

    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    citations: list[PolicyCitation] = []
    for text, meta, dist in zip(docs, metas, distances):
        # Chroma returns cosine distance in [0, 2]; convert to similarity in [0, 1]
        relevance = max(0.0, min(1.0, 1.0 - (dist / 2.0)))
        citations.append(
            PolicyCitation(
                text=text,
                source=(meta or {}).get("source") or "unknown",
                chapter=(meta or {}).get("chapter") or None,
                section=(meta or {}).get("section") or None,
                relevance_score=relevance,
            )
        )
    return citations

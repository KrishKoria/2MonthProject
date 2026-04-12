"""CMS policy document parser and chunker for RAG corpus ingestion.

Walks policy_docs_dir, reads text files, chunks ~500 tokens with 50-token overlap.
Metadata: source (filename), chapter, section, topic (from path / headings).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Approximate tokens using whitespace word count * 1.3 — good enough for chunking
CHUNK_SIZE_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 50
WORDS_PER_TOKEN = 0.75  # ~4 chars/token, ~5 chars/word


@dataclass
class DocumentChunk:
    """A chunked policy document ready for embedding."""

    chunk_id: str
    text: str
    source: str
    chapter: str | None
    section: str | None
    topic: str | None


def _tokens_to_words(n_tokens: int) -> int:
    return max(1, int(n_tokens * WORDS_PER_TOKEN / 0.75))  # keep loose


def _iter_chunks(text: str, chunk_words: int, overlap_words: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    step = max(1, chunk_words - overlap_words)
    for start in range(0, len(words), step):
        window = words[start : start + chunk_words]
        if not window:
            break
        chunks.append(" ".join(window))
        if start + chunk_words >= len(words):
            break
    return chunks


_HEADING_RE = re.compile(r"^(chapter|section)\s+([\w\-.]+)\s*[:\-]?\s*(.*)$", re.IGNORECASE)


def _extract_section_metadata(text: str) -> tuple[str | None, str | None]:
    """Pull chapter/section identifier from the first few lines if present."""
    chapter = section = None
    for line in text.splitlines()[:20]:
        m = _HEADING_RE.match(line.strip())
        if not m:
            continue
        kind = m.group(1).lower()
        ident = m.group(2)
        if kind == "chapter" and not chapter:
            chapter = ident
        elif kind == "section" and not section:
            section = ident
    return chapter, section


def parse_document(path: Path) -> list[DocumentChunk]:
    """Parse one policy document into chunks with metadata."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError as exc:
        logger.warning("Failed to read %s: %s", path, exc)
        return []

    text = text.strip()
    if not text:
        return []

    chapter, section = _extract_section_metadata(text)
    topic = path.parent.name if path.parent.name != path.parent.parent.name else None
    source = path.name

    chunk_words = int(CHUNK_SIZE_TOKENS / WORDS_PER_TOKEN)
    overlap_words = int(CHUNK_OVERLAP_TOKENS / WORDS_PER_TOKEN)

    chunks: list[DocumentChunk] = []
    for i, chunk_text in enumerate(_iter_chunks(text, chunk_words, overlap_words)):
        chunks.append(
            DocumentChunk(
                chunk_id=f"{path.stem}__{i:04d}",
                text=chunk_text,
                source=source,
                chapter=chapter,
                section=section,
                topic=topic,
            )
        )
    return chunks


def ingest_policy_corpus(policy_dir: Path | None = None) -> list[DocumentChunk]:
    """Walk the policy docs directory and produce all chunks."""
    root = policy_dir or settings.policy_docs_dir
    if not root.exists():
        logger.warning("Policy docs dir %s does not exist", root)
        return []

    all_chunks: list[DocumentChunk] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".txt", ".md"}:
            continue
        all_chunks.extend(parse_document(path))

    logger.info("Parsed %d chunks from %s", len(all_chunks), root)
    return all_chunks

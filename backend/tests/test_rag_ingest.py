"""Unit tests for the RAG ingest module (chunking + metadata extraction)."""

from pathlib import Path

from app.evidence.rag_ingest import (
    _extract_section_metadata,
    _iter_chunks,
    ingest_policy_corpus,
    parse_document,
)


def test_iter_chunks_handles_short_and_long_text():
    assert _iter_chunks("", 10, 2) == []
    assert _iter_chunks("one two three", 10, 2) == ["one two three"]

    words = " ".join(str(i) for i in range(25))
    chunks = _iter_chunks(words, chunk_words=10, overlap_words=2)
    assert len(chunks) >= 2
    # Overlap: last 2 words of chunk 0 appear as first words of chunk 1.
    tail = chunks[0].split()[-2:]
    head = chunks[1].split()[:2]
    assert tail == head


def test_extract_section_metadata_parses_heading_lines():
    text = "Chapter 12: Physicians\nSection 30.6.1 — E/M Services\nbody"
    chapter, section = _extract_section_metadata(text)
    assert chapter == "12"
    assert section == "30.6.1"


def test_parse_document_produces_chunks_with_metadata(tmp_path: Path):
    doc = tmp_path / "chapter12.md"
    doc.write_text(
        "Chapter 12: Physicians\n\n" + (" foo" * 500),
        encoding="utf-8",
    )
    chunks = parse_document(doc)
    assert chunks, "expected at least one chunk"
    assert all(c.source == "chapter12.md" for c in chunks)
    assert chunks[0].chapter == "12"
    assert chunks[0].chunk_id.startswith("chapter12__")


def test_parse_document_empty_file_returns_no_chunks(tmp_path: Path):
    doc = tmp_path / "blank.txt"
    doc.write_text("", encoding="utf-8")
    assert parse_document(doc) == []


def test_ingest_policy_corpus_walks_directory(tmp_path: Path):
    (tmp_path / "a.txt").write_text("hello world", encoding="utf-8")
    (tmp_path / "b.md").write_text("Chapter 1\nbody text here", encoding="utf-8")
    (tmp_path / "ignored.pdf").write_text("skip me", encoding="utf-8")

    chunks = ingest_policy_corpus(tmp_path)
    sources = {c.source for c in chunks}
    assert sources == {"a.txt", "b.md"}


def test_ingest_policy_corpus_missing_dir_returns_empty(tmp_path: Path):
    assert ingest_policy_corpus(tmp_path / "does-not-exist") == []

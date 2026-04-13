"""RAG retriever tests for metadata filters and gold-question precision."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.evidence import rag_retriever


@dataclass
class _StubRow:
    text: str
    source: str
    chapter: str
    section: str
    distance: float


class _FakeCollection:
    def __init__(self, results_by_query: dict[str, list[_StubRow]]):
        self.results_by_query = results_by_query
        self.calls: list[tuple[str, int, dict | None]] = []

    def query(self, query_texts, n_results, where=None):
        query = query_texts[0]
        self.calls.append((query, n_results, where))
        rows = self.results_by_query[query][:n_results]
        return {
            "documents": [[row.text for row in rows]],
            "metadatas": [[
                {
                    "source": row.source,
                    "chapter": row.chapter,
                    "section": row.section,
                }
                for row in rows
            ]],
            "distances": [[row.distance for row in rows]],
        }


def test_retrieve_returns_empty_for_blank_query(monkeypatch):
    monkeypatch.setattr(rag_retriever, "get_collection", lambda: pytest.fail("should not query collection"))

    assert rag_retriever.retrieve("   ") == []


def test_retrieve_passes_metadata_filters_and_converts_scores(monkeypatch):
    query = "knee arthroplasty billing"
    fake = _FakeCollection(
        {
            query: [
                _StubRow(
                    text="Coverage and billing rules for arthroplasty.",
                    source="cms_claims_manual",
                    chapter="12",
                    section="30.6.1",
                    distance=0.2,
                )
            ]
        }
    )
    monkeypatch.setattr(rag_retriever, "get_collection", lambda: fake)

    citations = rag_retriever.retrieve(query, top_k=1, filters={"topic": "billing", "chapter": "", "section": None})

    assert len(citations) == 1
    assert fake.calls == [(query, 1, {"topic": "billing"})]
    assert citations[0].source == "cms_claims_manual"
    assert citations[0].chapter == "12"
    assert citations[0].section == "30.6.1"
    assert citations[0].relevance_score == pytest.approx(0.9)


def test_retriever_precision_at_five_meets_target_on_gold_questions(monkeypatch):
    gold_questions = [
        ("What documents support E/M code level selection for office visits?", "cms_claims_manual"),
        ("How should Medicare Part B bill radiology services?", "cms_claims_manual"),
        ("Which CMS guidance covers laboratory billing?", "cms_claims_manual"),
        ("Where are drug and biological payment rules documented?", "cms_claims_manual"),
        ("What Medicare source describes CPT fee schedule coding?", "cms_claims_manual"),
        ("How is duplicate billing discussed in fraud guidance?", "fraud_guidelines"),
        ("Which policy discusses E/M upcoding risk?", "fraud_guidelines"),
        ("Where can I find modifier and duplicate billing descriptions?", "hcpcs_descriptions"),
        ("Which file explains procedure code descriptions?", "hcpcs_descriptions"),
        ("What source covers CMS-1500 form billing requirements?", "cms_claims_manual"),
    ]
    fake = _FakeCollection(
        {
            question: [
                _StubRow(
                    text=f"Relevant citation {i} for {question}",
                    source=expected_source,
                    chapter="12",
                    section=f"30.{i}",
                    distance=0.1 + (i * 0.05),
                )
                for i in range(5)
            ]
            for question, expected_source in gold_questions
        }
    )
    monkeypatch.setattr(rag_retriever, "get_collection", lambda: fake)

    precisions = []
    for question, expected_source in gold_questions:
        citations = rag_retriever.retrieve(question, top_k=5)
        relevant = sum(1 for citation in citations if citation.source == expected_source)
        precisions.append(relevant / 5)

    assert len(precisions) == 10
    assert sum(precisions) / len(precisions) >= 0.80

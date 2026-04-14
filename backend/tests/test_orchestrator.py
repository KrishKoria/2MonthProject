"""Orchestrator integration and unit tests for Phase 7."""

from __future__ import annotations

import json
from datetime import date
from types import SimpleNamespace

import pandas as pd
import pytest

from app.data.loader import DataStore
from app.data.schemas import EvidenceEnvelope, PolicyCitation, SourceRecord
from app.config import settings
from app.orchestrator import evidence as evidence_module
from app.orchestrator import graph as graph_module
from app.orchestrator import rationale as rationale_module
from app.orchestrator import tools as tools_module
from app.orchestrator.triage import run_triage


def _claim(
    *,
    claim_id: str = "CLM-1000",
    provider_id: str = "PRV-001",
    member_id: str = "MBR-001",
    service_date: date | None = date(2026, 3, 1),
    procedure_codes: list[str] | None = None,
    charge_amount: float = 220.0,
) -> dict:
    return {
        "claim_id": claim_id,
        "provider_id": provider_id,
        "member_id": member_id,
        "service_date": service_date,
        "procedure_codes": procedure_codes or ["99214", "27447"],
        "charge_amount": charge_amount,
    }


def _store() -> DataStore:
    store = DataStore()
    store.provider_roster_df = pd.DataFrame(
        [
            {"provider_id": "PRV-001", "specialty": "ORTHO", "name": "Alpha", "location_state": "MA"},
            {"provider_id": "PRV-002", "specialty": "ORTHO", "name": "Beta", "location_state": "MA"},
        ]
    )
    store.claims_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-1000",
                "provider_id": "PRV-001",
                "member_id": "MBR-001",
                "service_date": date(2026, 3, 1),
                "procedure_codes": ["99214", "27447"],
                "charge_amount": 220.0,
            },
            {
                "claim_id": "CLM-1001",
                "provider_id": "PRV-001",
                "member_id": "MBR-001",
                "service_date": date(2026, 3, 3),
                "procedure_codes": ["99214"],
                "charge_amount": 240.0,
            },
            {
                "claim_id": "CLM-1002",
                "provider_id": "PRV-002",
                "member_id": "MBR-009",
                "service_date": date(2026, 3, 2),
                "procedure_codes": ["27447"],
                "charge_amount": 180.0,
            },
        ]
    )
    return store


@pytest.mark.parametrize(
    ("rules_flags", "score", "procedure_codes", "expected_primary"),
    [
        (["ncci_conflict"], 25.0, ["27447", "27446"], "ncci_violation"),
        (["charge_outlier"], 82.0, ["99214"], "upcoding"),
        (["duplicate_match"], 18.0, ["99214"], "duplicate"),
    ],
)
def test_run_triage_routes_all_primary_anomaly_types(
    rules_flags: list[str],
    score: float,
    procedure_codes: list[str],
    expected_primary: str,
):
    state = {
        "claim_id": "CLM-1000",
        "claim_data": _claim(procedure_codes=procedure_codes),
        "rules_flags": rules_flags,
        "xgboost_risk_score": score,
    }

    result = run_triage(state)

    assert result["anomaly_type"] == expected_primary
    assert result["investigation_status"] == "triage_complete"
    assert expected_primary in result["anomaly_flags"]
    assert result["anomaly_flags"][expected_primary] == "detected"
    assert "rag_retrieval" in result["evidence_tools_to_use"]


def test_run_triage_marks_ncci_not_applicable_and_widens_tool_selection():
    state = {
        "claim_id": "CLM-1000",
        "claim_data": _claim(procedure_codes=["99213"]),
        "rules_flags": [],
        "xgboost_risk_score": 10.0,
    }

    result = run_triage(state)

    assert result["anomaly_type"] is None
    assert result["anomaly_flags"]["ncci_violation"] == "not_applicable"
    assert result["priority"] == "low"
    assert result["evidence_tools_to_use"] == [
        "ncci_lookup",
        "rag_retrieval",
        "provider_history",
        "duplicate_search",
    ]


def test_run_triage_uses_configured_thresholds(monkeypatch):
    monkeypatch.setattr(settings, "HIGH_RISK_THRESHOLD", 85.0, raising=False)
    monkeypatch.setattr(settings, "RISK_THRESHOLD", 55.0, raising=False)

    result = run_triage(
        {
            "claim_id": "CLM-1000",
            "claim_data": _claim(procedure_codes=["99213"]),
            "rules_flags": [],
            "xgboost_risk_score": 60.0,
        }
    )

    assert result["priority"] == "medium"
    assert result["anomaly_flags"]["upcoding"] == "insufficient_data"


def test_ncci_lookup_handles_conflict_no_codes_and_engine_error():
    class _ConflictEngine:
        def lookup_ncci_conflict(self, code_1, code_2, service_date):
            return {
                "conflict_exists": True,
                "edit_type": "unbundling",
                "effective_date": "2024-01-01",
                "rationale": "cannot be billed together",
            }

    finding, record = tools_module.ncci_lookup(_claim(procedure_codes=["27447", "27446"]), engine=_ConflictEngine())
    assert finding is not None
    assert finding.edit_type == "unbundling"
    assert record.status == "success"

    finding, record = tools_module.ncci_lookup(_claim(procedure_codes=["27447"]))
    assert finding is None
    assert record.reason == "no_ncci_codes_in_claim"

    class _BrokenEngine:
        def lookup_ncci_conflict(self, code_1, code_2, service_date):
            raise RuntimeError("boom")

    finding, record = tools_module.ncci_lookup(_claim(), engine=_BrokenEngine())
    assert finding is None
    assert record.reason == "engine_error"


def test_rag_retrieval_success_no_results_and_backend_error(monkeypatch):
    citation = PolicyCitation(
        text="Manual section for arthroplasty billing.",
        source="cms_claims_manual",
        chapter="12",
        section="30.6.1",
        relevance_score=0.93,
    )
    monkeypatch.setattr(tools_module, "retrieve", lambda query, top_k=5: [citation])
    citations, record = tools_module.rag_retrieval(_claim(), "upcoding")
    assert citations == [citation]
    assert record.status == "success"

    monkeypatch.setattr(tools_module, "retrieve", lambda query, top_k=5: [])
    citations, record = tools_module.rag_retrieval(_claim(), "duplicate")
    assert citations == []
    assert record.reason == "no_results"

    def _raise(query, top_k=5):
        raise tools_module.RAGRetrievalError("backend unavailable")

    monkeypatch.setattr(tools_module, "retrieve", _raise)
    citations, record = tools_module.rag_retrieval(_claim(), "ncci_violation")
    assert citations == []
    assert record.reason.startswith("rag_backend_error:")


def test_provider_history_handles_missing_provider_and_peer_summary():
    summary, record = tools_module.provider_history({"claim_id": "CLM-1000"}, _store())
    assert summary is None
    assert record.reason == "no_provider_id"

    summary, record = tools_module.provider_history(_claim(), _store())
    assert "Provider PRV-001" in (summary or "")
    assert "peer average" in (summary or "")
    assert record.status == "success"


def test_duplicate_search_handles_missing_input_and_returns_ranked_matches():
    store = _store()

    matches, record = tools_module.duplicate_search({"claim_id": "CLM-X"}, store)
    assert matches == []
    assert record.reason == "missing_member_or_date"

    matches, record = tools_module.duplicate_search(_claim(), store)
    assert record.status == "success"
    assert matches
    assert matches[0].claim_id == "CLM-1001"
    assert matches[0].similarity_score > 0


def test_run_evidence_marks_manual_review_when_every_source_unavailable(monkeypatch):
    unavailable = SourceRecord(tool="x", status="unavailable", reason="none")
    monkeypatch.setattr(evidence_module.tools, "ncci_lookup", lambda claim: (None, unavailable.model_copy(update={"tool": "ncci_lookup"})))
    monkeypatch.setattr(evidence_module.tools, "rag_retrieval", lambda claim, anomaly: ([], unavailable.model_copy(update={"tool": "rag_retrieval"})))
    monkeypatch.setattr(evidence_module.tools, "provider_history", lambda claim, store: (None, unavailable.model_copy(update={"tool": "provider_history"})))
    monkeypatch.setattr(evidence_module.tools, "duplicate_search", lambda claim, store: ([], unavailable.model_copy(update={"tool": "duplicate_search"})))

    result = evidence_module.run_evidence({"claim_data": _claim(), "anomaly_type": None}, _store())
    envelope = EvidenceEnvelope.model_validate(result["evidence_results"])

    assert result["investigation_status"] == "manual_review_required"
    assert len(envelope.sources_consulted) == 4
    assert all(source.status == "unavailable" for source in envelope.sources_consulted)


def test_run_evidence_completes_when_any_source_returns_signal(monkeypatch):
    citation = PolicyCitation(
        text="Relevant policy language.",
        source="cms_claims_manual",
        chapter="12",
        section="30.6.1",
        relevance_score=0.89,
    )
    monkeypatch.setattr(
        evidence_module.tools,
        "ncci_lookup",
        lambda claim: (None, SourceRecord(tool="ncci_lookup", status="success", reason="no_conflicts_found")),
    )
    monkeypatch.setattr(
        evidence_module.tools,
        "rag_retrieval",
        lambda claim, anomaly: ([citation], SourceRecord(tool="rag_retrieval", status="success", reason=None)),
    )
    monkeypatch.setattr(
        evidence_module.tools,
        "provider_history",
        lambda claim, store: ("Provider context", SourceRecord(tool="provider_history", status="success", reason=None)),
    )
    monkeypatch.setattr(
        evidence_module.tools,
        "duplicate_search",
        lambda claim, store: ([], SourceRecord(tool="duplicate_search", status="success", reason=None)),
    )

    result = evidence_module.run_evidence({"claim_data": _claim(), "anomaly_type": "upcoding"}, _store())
    envelope = EvidenceEnvelope.model_validate(result["evidence_results"])

    assert result["investigation_status"] == "evidence_complete"
    assert envelope.policy_citations[0].source == "cms_claims_manual"
    assert envelope.provider_context == "Provider context"


class _FakeStream:
    def __init__(self, chunks: list[str]):
        self._chunks = chunks

    def __aiter__(self):
        self._iter = iter(self._chunks)
        return self

    async def __anext__(self):
        try:
            text = next(self._iter)
        except StopIteration as exc:  # pragma: no cover - protocol branch
            raise StopAsyncIteration from exc
        return SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content=text))]
        )


def _fake_client(chunks: list[str], *, exc: Exception | None = None):
    class _Completions:
        async def create(self, **kwargs):
            if exc is not None:
                raise exc
            return _FakeStream(chunks)

    return SimpleNamespace(chat=SimpleNamespace(completions=_Completions()))


def _rationale_state() -> dict:
    return {
        "claim_id": "CLM-1000",
        "claim_data": _claim(),
        "anomaly_type": "upcoding",
        "anomaly_flags": {
            "upcoding": "detected",
            "ncci_violation": "not_applicable",
            "duplicate": "insufficient_data",
        },
        "confidence": 0.82,
        "priority": "high",
        "xgboost_risk_score": 0.9,
        "evidence_results": {
            "policy_citations": [
                {
                    "text": "CPT billing guidance.",
                    "source": "cms_claims_manual",
                    "chapter": "12",
                    "section": "30.6.1",
                    "relevance_score": 0.91,
                }
            ],
            "sources_consulted": [
                {"tool": "rag_retrieval", "status": "success", "reason": None},
            ],
        },
    }


@pytest.mark.asyncio
async def test_stream_rationale_emits_chunks_and_complete_result():
    payload = {
        "summary": "The claim exceeds peer billing norms.",
        "supporting_evidence": ["Charge ratio is materially above peer average."],
        "policy_citations": [
            {
                "text": "CPT billing guidance.",
                "source": "cms_claims_manual",
                "chapter": "12",
                "section": "30.6.1",
                "relevance_score": 0.91,
            }
        ],
        "anomaly_flags_addressed": {
            "upcoding": "Charge is elevated against the evidence.",
            "ncci_violation": None,
            "duplicate": "No confirmed duplicate, but records are close in time.",
        },
        "recommended_action": "Refer for documentation review.",
        "confidence": 0.84,
        "review_needed": True,
    }
    raw = json.dumps(payload)
    client = _fake_client([raw[:80], raw[80:]])

    events = [event async for event in rationale_module.stream_rationale(_rationale_state(), client=client, model="fake-model")]

    assert any(event["type"] == "chunk" for event in events)
    complete = next(event for event in events if event["type"] == "complete")
    assert complete["result"].recommended_action == "Refer for documentation review."


@pytest.mark.asyncio
async def test_stream_rationale_reports_missing_flags_and_run_rationale_maps_error():
    payload = {
        "summary": "Missing one flag.",
        "supporting_evidence": ["Evidence"],
        "policy_citations": [],
        "anomaly_flags_addressed": {
            "upcoding": "addressed",
            "ncci_violation": None,
        },
        "recommended_action": "Refer for manual review.",
        "confidence": 0.6,
        "review_needed": True,
    }
    client = _fake_client([json.dumps(payload)])
    events = [event async for event in rationale_module.stream_rationale(_rationale_state(), client=client, model="fake-model")]

    error = next(event for event in events if event["type"] == "error")
    assert error["message"].startswith("missing_anomaly_flags_addressed:")

    result = await rationale_module.run_rationale(_rationale_state(), client=client, model="fake-model")
    assert result["investigation_status"] == "error"


@pytest.mark.asyncio
async def test_stream_rationale_handles_llm_exception():
    client = _fake_client([], exc=RuntimeError("network down"))
    events = [event async for event in rationale_module.stream_rationale(_rationale_state(), client=client, model="fake-model")]

    assert events[-1]["type"] == "error"
    assert events[-1]["message"].startswith("llm_error:")


@pytest.mark.asyncio
async def test_stream_rationale_rejects_detected_flags_without_explanations():
    payload = {
        "summary": "The model flagged upcoding.",
        "supporting_evidence": ["Charge ratio is elevated."],
        "policy_citations": [],
        "anomaly_flags_addressed": {
            "upcoding": None,
            "ncci_violation": None,
            "duplicate": "Not enough overlap to confirm a duplicate.",
        },
        "recommended_action": "Refer for manual review.",
        "confidence": 0.7,
        "review_needed": True,
    }
    client = _fake_client([json.dumps(payload)])

    events = [
        event async for event in rationale_module.stream_rationale(
            _rationale_state(),
            client=client,
            model="fake-model",
        )
    ]

    error = next(event for event in events if event["type"] == "error")
    assert error["message"].startswith("missing_detected_flag_explanations:")


@pytest.mark.asyncio
async def test_stream_rationale_checks_margin_space_shap_invariant_before_llm():
    payload = {
        "summary": "Should never reach the LLM.",
        "supporting_evidence": ["placeholder"],
        "policy_citations": [],
        "anomaly_flags_addressed": {
            "upcoding": "addressed",
            "ncci_violation": None,
            "duplicate": None,
        },
        "recommended_action": "Refer for review.",
        "confidence": 0.5,
        "review_needed": True,
    }
    called = {"create": 0}

    class _Completions:
        async def create(self, **kwargs):
            called["create"] += 1
            return _FakeStream([json.dumps(payload)])

    client = SimpleNamespace(chat=SimpleNamespace(completions=_Completions()))
    state = _rationale_state() | {
        "shap_values": {"charge_amount": 0.9},
        "xgboost_raw_margin": 0.1,
        "shap_base_value": 0.0,
    }
    events = [
        event async for event in rationale_module.stream_rationale(
            state,
            client=client,
            model="fake-model",
        )
    ]

    assert called["create"] == 0
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert events[0]["message"].startswith("SHAP invariant violated:")


@pytest.mark.asyncio
async def test_stream_rationale_sets_timeout_and_surfaces_timeout_error():
    seen: dict[str, object] = {}

    class _Completions:
        async def create(self, **kwargs):
            seen["timeout"] = kwargs.get("timeout")
            raise TimeoutError("upstream timed out")

    client = SimpleNamespace(chat=SimpleNamespace(completions=_Completions()))
    events = [
        event async for event in rationale_module.stream_rationale(
            _rationale_state(),
            client=client,
            model="fake-model",
        )
    ]

    assert seen["timeout"] == rationale_module.settings.LLM_TIMEOUT_SECONDS
    assert events[-1]["type"] == "error"
    assert events[-1]["message"].startswith("llm_timeout:")


@pytest.mark.asyncio
async def test_build_graph_halts_before_rationale_when_evidence_requires_manual_review(monkeypatch):
    called = {"rationale": 0}

    monkeypatch.setattr(
        graph_module,
        "run_triage",
        lambda state: {"investigation_status": "triage_complete", "anomaly_type": None},
    )
    monkeypatch.setattr(
        graph_module,
        "run_evidence",
        lambda state, store: {"investigation_status": "manual_review_required", "evidence_results": {}},
    )

    async def _rationale(state):
        called["rationale"] += 1
        return {"investigation_status": "complete"}

    monkeypatch.setattr(graph_module, "run_rationale", _rationale)

    result = await graph_module.build_graph(_store()).ainvoke({"claim_id": "CLM-1000"})

    assert result["investigation_status"] == "manual_review_required"
    assert called["rationale"] == 0


@pytest.mark.asyncio
async def test_build_graph_reaches_complete_path(monkeypatch):
    monkeypatch.setattr(
        graph_module,
        "run_triage",
        lambda state: {"investigation_status": "triage_complete", "anomaly_type": "upcoding"},
    )
    monkeypatch.setattr(
        graph_module,
        "run_evidence",
        lambda state, store: {"investigation_status": "evidence_complete", "evidence_results": {"policy_citations": [], "sources_consulted": []}},
    )

    async def _rationale(state):
        return {"investigation_status": "complete", "rationale": {"summary": "done"}}

    monkeypatch.setattr(graph_module, "run_rationale", _rationale)

    result = await graph_module.build_graph(_store()).ainvoke({"claim_id": "CLM-1000"})

    assert result["investigation_status"] == "complete"
    assert result["rationale"]["summary"] == "done"

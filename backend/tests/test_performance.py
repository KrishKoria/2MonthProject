"""Latency-oriented investigation pipeline test with mocked LLM."""

from __future__ import annotations

import time
from datetime import date, datetime, timezone

import pandas as pd
from fastapi.testclient import TestClient

from app.api.dependencies import get_data_store
from app.api.routes import investigation as investigation_routes
from app.data.loader import DataStore
from app.data.schemas import RationaleResult
from app.main import app


def _store() -> DataStore:
    store = DataStore()
    store.claims_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-PERF-1",
                "member_id": "MBR-001",
                "provider_id": "PRV-001",
                "service_date": date(2026, 3, 1),
                "claim_receipt_date": date(2026, 3, 3),
                "procedure_codes": ["99214", "27447"],
                "diagnosis_codes": ["M17.11"],
                "modifiers": [],
                "charge_amount": 240.0,
                "allowed_amount": 180.0,
                "paid_amount": 150.0,
                "place_of_service": "11",
                "claim_status": "pending_review",
                "anomaly_type": "upcoding",
            }
        ]
    )
    store.risk_scores_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-PERF-1",
                "xgboost_score": 88.0,
                "shap_values": {"charge_to_allowed_ratio": 0.35},
                "rules_flags": ["charge_outlier"],
                "risk_band": "high",
                "scored_at": datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
            }
        ]
    )
    return store


def test_investigation_pipeline_meets_latency_targets_with_mocked_llm(monkeypatch):
    store = _store()
    app.dependency_overrides[get_data_store] = lambda: store

    monkeypatch.setattr(
        investigation_routes,
        "run_triage",
        lambda state: {
            "anomaly_type": "upcoding",
            "anomaly_flags": {
                "upcoding": "detected",
                "ncci_violation": "not_applicable",
                "duplicate": "insufficient_data",
            },
            "confidence": 0.83,
            "priority": "high",
            "evidence_tools_to_use": ["rag_retrieval", "provider_history"],
            "investigation_status": "triage_complete",
        },
    )
    monkeypatch.setattr(
        investigation_routes,
        "run_evidence",
        lambda state, data_store: {
            "investigation_status": "evidence_complete",
            "evidence_results": {
                "policy_citations": [
                    {
                        "text": "Relevant CMS guidance.",
                        "source": "cms_claims_manual",
                        "chapter": "12",
                        "section": "30.6.1",
                        "relevance_score": 0.91,
                    }
                ],
                "sources_consulted": [
                    {"tool": "ncci_lookup", "status": "success", "reason": "no_conflicts_found"},
                    {"tool": "rag_retrieval", "status": "success", "reason": None},
                    {"tool": "provider_history", "status": "success", "reason": None},
                    {"tool": "duplicate_search", "status": "success", "reason": None},
                ],
            },
        },
    )

    async def _stream_rationale(state):
        yield {"type": "chunk", "text": "Charge looks elevated. "}
        yield {
            "type": "complete",
            "result": RationaleResult(
                summary="Charge is elevated relative to peers.",
                supporting_evidence=["Peer comparison is materially above average."],
                policy_citations=[
                    {
                        "text": "Relevant CMS guidance.",
                        "source": "cms_claims_manual",
                        "chapter": "12",
                        "section": "30.6.1",
                        "relevance_score": 0.91,
                    }
                ],
                anomaly_flags_addressed={
                    "upcoding": "Peer billing is elevated.",
                    "ncci_violation": None,
                    "duplicate": "No duplicate confirmed.",
                },
                recommended_action="Refer for documentation review.",
                confidence=0.86,
                review_needed=True,
            ),
        }

    monkeypatch.setattr(investigation_routes, "stream_rationale", _stream_rationale)

    try:
        with TestClient(app) as client, client.stream("POST", "/api/claims/CLM-PERF-1/investigate") as response:
            start = time.perf_counter()
            triage_at = None
            evidence_at = None
            body_lines: list[str] = []

            for line in response.iter_lines():
                if not line:
                    continue
                body_lines.append(line)
                if line == "event: triage" and triage_at is None:
                    triage_at = time.perf_counter()
                if line == "event: evidence" and evidence_at is None:
                    evidence_at = time.perf_counter()

            elapsed = time.perf_counter() - start

        body = "\n".join(body_lines)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["x-accel-buffering"] == "no"
        assert triage_at is not None
        assert evidence_at is not None
        assert (triage_at - start) < 0.1
        assert (evidence_at - triage_at) < 2.0
        assert elapsed < 15.0
        assert "event: complete" in body
    finally:
        app.dependency_overrides.clear()

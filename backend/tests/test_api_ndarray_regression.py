"""Regression tests for ndarray-backed fields loaded from Parquet."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_data_store
from app.data.loader import DataStore
from app.data.schemas import PolicyCitation, RationaleResult
from app.main import app


def _make_store() -> DataStore:
    store = DataStore()
    store.claims_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-ND-001",
                "member_id": "MBR-ND-001",
                "provider_id": "PRV-ND-001",
                "service_date": date(2026, 3, 1),
                "claim_receipt_date": date(2026, 3, 5),
                "procedure_codes": np.array(["99214", "99215"], dtype=object),
                "diagnosis_codes": np.array(["I10", "M17.11"], dtype=object),
                "modifiers": np.array([], dtype=object),
                "charge_amount": 600.0,
                "allowed_amount": 150.0,
                "paid_amount": 120.0,
                "place_of_service": "11",
                "claim_status": "pending_review",
                "anomaly_type": "upcoding",
            }
        ]
    )
    store.risk_scores_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-ND-001",
                "xgboost_score": 92.0,
                "shap_values": {"charge_to_allowed_ratio": 0.35},
                "rules_flags": np.array(["charge_outlier", "duplicate_match"], dtype=object),
                "risk_band": "high",
                "scored_at": datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
            },
            {
                "claim_id": "CLM-ND-002",
                "xgboost_score": 10.0,
                "shap_values": {},
                "rules_flags": np.array([], dtype=object),
                "risk_band": "low",
                "scored_at": datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
            },
        ]
    )

    def _save(inv):
        store.investigations[inv.claim_id] = inv

    store.save_investigation = _save  # type: ignore[method-assign]
    return store


def _collect_events(response) -> list[dict]:
    events: list[dict] = []
    current: dict[str, str] = {}
    for raw_line in response.iter_lines():
        line = raw_line.decode() if isinstance(raw_line, bytes) else raw_line
        if not line:
            if current:
                events.append({"event": current["event"], "data": json.loads(current["data"])})
                current = {}
            continue
        if line.startswith("event:"):
            current["event"] = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            current["data"] = line.split(":", 1)[1].strip()
    if current:
        events.append({"event": current["event"], "data": json.loads(current["data"])})
    return events


@pytest.fixture
def client():
    store = _make_store()
    app.dependency_overrides[get_data_store] = lambda: store
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_overview_handles_rules_flags_loaded_as_ndarray(client):
    response = client.get("/api/analytics/overview")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["flagged_count"] == 1
    assert data["rules_baseline_flagged"] == 1


def test_claims_list_handles_claim_fields_loaded_as_ndarray(client):
    response = client.get("/api/claims?page=1&page_size=25&sort_by=risk_score&sort_dir=desc")

    assert response.status_code == 200
    claim = response.json()["data"]["claims"][0]
    assert claim["procedure_codes"] == ["99214", "99215"]
    assert claim["diagnosis_codes"] == ["I10", "M17.11"]
    assert claim["modifiers"] == []
    assert claim["rules_flags"] == ["charge_outlier", "duplicate_match"]


def test_investigation_endpoint_handles_ndarray_claim_and_score_fields(client, monkeypatch):
    from app.api.routes import investigation as investigation_routes

    monkeypatch.setattr(
        investigation_routes,
        "run_evidence",
        lambda state, store: {
            "evidence_results": {
                "policy_citations": [
                    {
                        "text": "CMS citation.",
                        "source": "cms_claims_manual",
                        "chapter": "12",
                        "section": "30.6.1",
                        "relevance_score": 0.95,
                    }
                ],
                "ncci_findings": None,
                "provider_context": "Provider summary.",
                "duplicate_matches": [],
                "sources_consulted": [
                    {"tool": "ncci_lookup", "status": "success", "reason": "no_conflicts_found"},
                    {"tool": "rag_retrieval", "status": "success", "reason": None},
                    {"tool": "provider_history", "status": "success", "reason": None},
                    {"tool": "duplicate_search", "status": "success", "reason": None},
                ],
            },
            "investigation_status": "evidence_complete",
        },
    )

    async def fake_stream_rationale(state):
        yield {"type": "chunk", "text": "Investigating"}
        yield {
            "type": "complete",
            "result": RationaleResult(
                summary="Claim looks suspicious.",
                supporting_evidence=["Charge exceeds peer average."],
                policy_citations=[
                    PolicyCitation(
                        text="CMS citation.",
                        source="cms_claims_manual",
                        chapter="12",
                        section="30.6.1",
                        relevance_score=0.95,
                    )
                ],
                anomaly_flags_addressed={
                    "upcoding": "Addressed",
                    "ncci_violation": None,
                    "duplicate": None,
                },
                recommended_action="Escalate for review.",
                confidence=0.88,
                review_needed=True,
            ),
        }

    monkeypatch.setattr(investigation_routes, "stream_rationale", fake_stream_rationale)

    with client.stream("POST", "/api/claims/CLM-ND-001/investigate") as response:
        events = _collect_events(response)

    assert response.status_code == 200
    assert [event["event"] for event in events] == ["triage", "evidence", "rationale_chunk", "complete"]

"""API route tests for claims, analytics, investigation endpoints (US1/US2)."""

from datetime import date, datetime, timezone

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_data_store
from app.config import settings
from app.data.loader import DataStore, load_data_store
from app.data.schemas import (
    EvidenceEnvelope,
    Investigation,
    InvestigationStatus,
    PolicyCitation,
    RationaleResult,
    SourceRecord,
    TriageResult,
)
from app.main import app


def _make_store() -> DataStore:
    store = DataStore()
    store.claims_df = pd.DataFrame([
        {
            "claim_id": "CLM-0001",
            "member_id": "MBR-001",
            "provider_id": "PRV-001",
            "service_date": date(2026, 3, 1),
            "claim_receipt_date": date(2026, 3, 5),
            "procedure_codes": ["99213"],
            "diagnosis_codes": ["M17.11"],
            "modifiers": [],
            "charge_amount": 150.0,
            "allowed_amount": 100.0,
            "paid_amount": 80.0,
            "place_of_service": "11",
            "claim_status": "pending_review",
            "anomaly_type": "upcoding",
        },
        {
            "claim_id": "CLM-0002",
            "member_id": "MBR-002",
            "provider_id": "PRV-002",
            "service_date": date(2026, 3, 10),
            "claim_receipt_date": date(2026, 3, 15),
            "procedure_codes": ["27447"],
            "diagnosis_codes": ["M17.11"],
            "modifiers": [],
            "charge_amount": 8450.0,
            "allowed_amount": 3200.0,
            "paid_amount": 2500.0,
            "place_of_service": "22",
            "claim_status": "pending_review",
            "anomaly_type": None,
        },
        {
            "claim_id": "CLM-0003",
            "member_id": "MBR-003",
            "provider_id": "PRV-001",
            "service_date": date(2026, 2, 1),
            "claim_receipt_date": date(2026, 2, 10),
            "procedure_codes": ["99214"],
            "diagnosis_codes": ["E11.9"],
            "modifiers": [],
            "charge_amount": 220.0,
            "allowed_amount": 180.0,
            "paid_amount": 150.0,
            "place_of_service": "11",
            "claim_status": "accepted",
            "anomaly_type": "ncci_violation",
        },
    ])
    store.risk_scores_df = pd.DataFrame([
        {
            "claim_id": "CLM-0001",
            "xgboost_score": 87.0,
            "shap_values": {"charge_to_allowed_ratio": 0.31},
            "rules_flags": ["charge_outlier"],
            "risk_band": "high",
            "scored_at": datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
        },
        {
            "claim_id": "CLM-0002",
            "xgboost_score": 45.0,
            "shap_values": {},
            "rules_flags": [],
            "risk_band": "medium",
            "scored_at": datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
        },
        {
            "claim_id": "CLM-0003",
            "xgboost_score": 20.0,
            "shap_values": {},
            "rules_flags": ["ncci_conflict"],
            "risk_band": "low",
            "scored_at": datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
        },
    ])
    return store


@pytest.fixture
def client():
    store = _make_store()
    app.dependency_overrides[get_data_store] = lambda: store
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_list_claims_returns_paginated_envelope(client):
    res = client.get("/api/claims")
    assert res.status_code == 200
    body = res.json()
    assert "data" in body
    data = body["data"]
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 25
    assert len(data["claims"]) == 3
    assert data["claims"][0]["claim_id"] == "CLM-0001"
    assert data["claims"][0]["risk_score"] == 87.0
    assert data["claims"][0]["risk_band"] == "high"


def test_list_claims_filters_by_risk_band(client):
    res = client.get("/api/claims?risk_band=high")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total"] == 1
    assert data["claims"][0]["claim_id"] == "CLM-0001"


def test_list_claims_filters_by_anomaly_type(client):
    res = client.get("/api/claims?anomaly_type=upcoding")
    data = res.json()["data"]
    assert data["total"] == 1
    assert data["claims"][0]["anomaly_type"] == "upcoding"


def test_list_claims_filters_by_provider(client):
    res = client.get("/api/claims?provider_id=PRV-001")
    data = res.json()["data"]
    assert data["total"] == 2


def test_list_claims_filters_by_date_range(client):
    res = client.get("/api/claims?date_from=2026-03-01&date_to=2026-03-31")
    data = res.json()["data"]
    assert data["total"] == 2


def test_list_claims_pagination(client):
    res = client.get("/api/claims?page=1&page_size=2")
    data = res.json()["data"]
    assert data["total"] == 3
    assert len(data["claims"]) == 2
    assert data["page_size"] == 2


def _sample_investigation(claim_id: str = "CLM-0001") -> Investigation:
    return Investigation(
        claim_id=claim_id,
        investigation_status=InvestigationStatus.COMPLETE,
        triage=TriageResult(
            anomaly_type="upcoding",
            anomaly_flags={
                "upcoding": "detected",
                "ncci_violation": "not_applicable",
                "duplicate": "insufficient_data",
            },
            confidence=0.81,
            priority="high",
            evidence_tools_to_use=["rag_retrieval", "provider_history"],
        ),
        evidence=EvidenceEnvelope(
            policy_citations=[
                PolicyCitation(
                    text="E&M code selection must reflect documented complexity.",
                    source="CMS Claims Manual",
                    chapter="12",
                    section="30.6.1",
                    relevance_score=0.91,
                )
            ],
            sources_consulted=[
                SourceRecord(tool="ncci_lookup", status="unavailable", reason="no_ncci_codes_in_claim"),
                SourceRecord(tool="rag_retrieval", status="success", reason=None),
                SourceRecord(tool="provider_history", status="success", reason=None),
                SourceRecord(tool="duplicate_search", status="success", reason=None),
            ],
        ),
        rationale=RationaleResult(
            summary="Charge exceeds peer average.",
            supporting_evidence=["provider_history indicates 3.1x peer avg"],
            policy_citations=[],
            anomaly_flags_addressed={
                "upcoding": "Charge inflation versus specialty peers.",
                "ncci_violation": None,
                "duplicate": None,
            },
            recommended_action="Refer for clinical documentation review.",
            confidence=0.78,
            review_needed=True,
        ),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_investigation_survives_restart(tmp_path, monkeypatch):
    """T056a / FR-011: save_investigation persists to Parquet and reloads intact."""
    data_dir = tmp_path / "data"
    monkeypatch.setattr(settings, "DATA_DIR", data_dir)

    store = DataStore()
    original = _sample_investigation()
    store.save_investigation(original)

    assert (data_dir / "scores" / "investigations.parquet").exists()

    # Simulate restart — reload from disk.
    reloaded_store = load_data_store()
    loaded = reloaded_store.investigations.get(original.claim_id)

    assert loaded is not None, "investigation did not survive restart"
    assert loaded.claim_id == original.claim_id
    assert loaded.investigation_status == InvestigationStatus.COMPLETE
    assert loaded.triage is not None
    assert loaded.triage.anomaly_type == "upcoding"
    assert loaded.triage.anomaly_flags["upcoding"] == "detected"
    assert loaded.rationale is not None
    assert "Refer" in loaded.rationale.recommended_action
    assert loaded.evidence is not None
    assert len(loaded.evidence.sources_consulted) == 4


def test_get_investigation_returns_stored_result(client):
    from app.main import app as _app

    # Retrieve the store bound to this test client via the dependency override.
    store: DataStore = _app.dependency_overrides[get_data_store]()
    inv = _sample_investigation("CLM-0001")
    store.investigations[inv.claim_id] = inv

    res = client.get("/api/claims/CLM-0001/investigation")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["claim_id"] == "CLM-0001"
    assert body["investigation_status"] == "complete"
    assert body["triage"]["anomaly_type"] == "upcoding"

    res2 = client.get("/api/claims/CLM-0002/investigation")
    assert res2.status_code == 404


def test_investigation_status_polling_fallback(client):
    from app.main import app as _app

    store: DataStore = _app.dependency_overrides[get_data_store]()
    # No investigation yet → status=pending
    res = client.get("/api/claims/CLM-0002/investigation/status")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["investigation_status"] == "pending"
    assert data["triage"] is None

    # With one stored → returns stored fields
    inv = _sample_investigation("CLM-0002")
    store.investigations[inv.claim_id] = inv
    res = client.get("/api/claims/CLM-0002/investigation/status")
    data = res.json()["data"]
    assert data["investigation_status"] == "complete"
    assert data["triage"]["anomaly_type"] == "upcoding"


def test_analytics_overview(client):
    res = client.get("/api/analytics/overview")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total_claims"] == 3
    assert data["high_risk_count"] == 1
    assert data["flagged_count"] >= 1
    assert data["anomaly_distribution"]["upcoding"] == 1
    assert data["anomaly_distribution"]["ncci_violation"] == 1
    assert "rules_baseline_flagged" in data
    assert "ml_only_flagged" in data
    assert "combined_flagged" in data

"""Validation-script tests for rationale schema and rubric scoring."""

from __future__ import annotations

import pandas as pd
import pytest

from app.data.loader import DataStore
from scripts.validate_prompt import (
    _assert_risk_score_schema,
    _initial_state,
    score_rationale_usefulness,
    select_representative_claim_ids,
    validate_rationale_payload,
)


def test_select_representative_claim_ids_prefers_highest_scored_flagged_claims():
    claims_df = pd.DataFrame(
        [
            {"claim_id": "U1", "anomaly_type": "upcoding"},
            {"claim_id": "U2", "anomaly_type": "upcoding"},
            {"claim_id": "N1", "anomaly_type": "ncci_violation"},
            {"claim_id": "N2", "anomaly_type": "ncci_violation"},
            {"claim_id": "D1", "anomaly_type": "duplicate"},
            {"claim_id": "D2", "anomaly_type": "duplicate"},
            {"claim_id": "CLEAN", "anomaly_type": None},
        ]
    )
    risk_scores_df = pd.DataFrame(
        [
            {"claim_id": "U1", "xgboost_score": 95.0, "risk_band": "high", "rules_flags": []},
            {"claim_id": "U2", "xgboost_score": 91.0, "risk_band": "high", "rules_flags": []},
            {"claim_id": "N1", "xgboost_score": 93.0, "risk_band": "high", "rules_flags": []},
            {"claim_id": "N2", "xgboost_score": 90.0, "risk_band": "high", "rules_flags": []},
            {"claim_id": "D1", "xgboost_score": 92.0, "risk_band": "high", "rules_flags": []},
            {"claim_id": "D2", "xgboost_score": 89.0, "risk_band": "high", "rules_flags": []},
            {"claim_id": "CLEAN", "xgboost_score": 15.0, "risk_band": "low", "rules_flags": []},
        ]
    )

    selected = select_representative_claim_ids(claims_df, risk_scores_df, limit=6)

    assert len(selected) == 6
    assert selected[:3] == ["U1", "N1", "D1"]
    assert "CLEAN" not in selected


def test_validate_rationale_payload_enforces_schema_and_business_rules():
    valid_payload = {
        "summary": "The claim appears upcoded relative to peers.",
        "supporting_evidence": ["Charge ratio is above peer norms."],
        "policy_citations": [
            {
                "text": "Relevant CMS guidance.",
                "source": "cms_claims_manual",
                "chapter": "12",
                "section": "30.6.1",
                "relevance_score": 0.91,
            }
        ],
        "anomaly_flags_addressed": {
            "upcoding": "Charge ratio supports upcoding review.",
            "ncci_violation": None,
            "duplicate": "No duplicate was confirmed.",
        },
        "recommended_action": "Refer for documentation review.",
        "confidence": 0.82,
        "review_needed": True,
    }

    passed, reasons = validate_rationale_payload(valid_payload)
    assert passed is True
    assert reasons == []

    invalid_payload = {
        "summary": "Missing citations and action.",
        "supporting_evidence": [],
        "policy_citations": [],
        "anomaly_flags_addressed": {"upcoding": "addressed"},
        "recommended_action": "",
        "confidence": 0.5,
        "review_needed": True,
    }
    passed, reasons = validate_rationale_payload(invalid_payload)
    assert passed is False
    assert "policy_citations_empty" in reasons
    assert "missing_anomaly_flag_keys" in reasons
    assert "recommended_action_empty" in reasons


def test_score_rationale_usefulness_applies_defined_rubric():
    citations = [{"source": "cms_claims_manual"}]

    useful = score_rationale_usefulness(
        {
            "anomaly_type": "upcoding",
            "policy_citations": citations,
            "recommended_action": "Refer for documentation review.",
        },
        expected_anomaly_type="upcoding",
        retrieved_citations=citations,
    )
    assert useful == "useful"

    partially_useful = score_rationale_usefulness(
        {
            "anomaly_type": "upcoding",
            "policy_citations": [],
            "recommended_action": "Refer for documentation review.",
        },
        expected_anomaly_type="upcoding",
        retrieved_citations=citations,
    )
    assert partially_useful == "partially_useful"

    not_useful = score_rationale_usefulness(
        {
            "anomaly_type": "duplicate",
            "policy_citations": [{"source": "hallucinated"}],
            "recommended_action": "Refer for documentation review.",
        },
        expected_anomaly_type="upcoding",
        retrieved_citations=citations,
    )
    assert not_useful == "not_useful"


def test_initial_state_preserves_shap_invariant_inputs_from_risk_scores():
    store = DataStore(
        claims_df=pd.DataFrame(
            [
                {
                    "claim_id": "CLM-1",
                    "anomaly_type": "upcoding",
                }
            ]
        ),
        risk_scores_df=pd.DataFrame(
            [
                {
                    "claim_id": "CLM-1",
                    "xgboost_score": 91.2,
                    "xgboost_raw_margin": 1.37,
                    "shap_values": {"charge_amount": 0.42},
                    "shap_base_value": 0.19,
                    "rules_flags": ["high_charge"],
                    "risk_band": "high",
                }
            ]
        ),
    )

    state = _initial_state(store, "CLM-1")

    assert state["xgboost_risk_score"] == 91.2
    assert state["xgboost_raw_margin"] == 1.37
    assert state["shap_values"] == {"charge_amount": 0.42}
    assert state["shap_base_value"] == 0.19
    assert state["rules_flags"] == ["high_charge"]


def test_assert_risk_score_schema_raises_for_missing_shap_invariant_columns():
    risk_scores_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-1",
                "xgboost_score": 91.2,
                "shap_values": {"charge_amount": 0.42},
                "rules_flags": ["high_charge"],
                "risk_band": "high",
            }
        ]
    )

    with pytest.raises(RuntimeError, match="missing required columns"):
        _assert_risk_score_schema(risk_scores_df)

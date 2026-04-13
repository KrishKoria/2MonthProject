"""Model, SHAP, and scoring pipeline tests for Phase 7."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from app.ml import pipeline as pipeline_module
from app.ml.explainer import SHAPExplainer
from app.ml.model import FEATURE_COLUMNS, evaluate_model, grouped_temporal_split, train_xgboost
from app.ml.pipeline import assign_risk_band, batch_score


def _synthetic_training_frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(42)
    start = date(2026, 1, 1)
    rows: list[dict[str, object]] = []

    def _provider_for(idx: int) -> str:
        if idx < 120:
            return f"TR-{idx % 6}"
        if idx < 160:
            return f"VA-{idx % 3}"
        return f"TE-{idx % 4}"

    anomaly_cycle = ["upcoding", "ncci_violation", "duplicate"]

    for idx in range(200):
        is_anomaly = 1 if idx % 4 == 0 else 0
        provider_id = _provider_for(idx)
        anomaly_type = anomaly_cycle[idx % len(anomaly_cycle)] if is_anomaly else None
        base = 0.9 if is_anomaly else 0.1

        row: dict[str, object] = {
            "claim_id": f"CLM-{idx:04d}",
            "provider_id": provider_id,
            "claim_receipt_date": start + timedelta(days=idx),
            "is_anomaly": is_anomaly,
            "anomaly_type": anomaly_type,
        }
        for col_index, column in enumerate(FEATURE_COLUMNS):
            if column in {"has_ncci_conflict", "modifier_59_present"}:
                row[column] = int(is_anomaly)
            else:
                noise = float(rng.normal(loc=0.0, scale=0.015))
                row[column] = round(base + (col_index * 0.002) + noise, 4)
        rows.append(row)

    features_df = pd.DataFrame(rows)
    claims_df = features_df[["claim_id", "provider_id", "claim_receipt_date"]].copy()
    return features_df, claims_df


def test_grouped_temporal_split_keeps_train_and_test_providers_disjoint():
    features_df, claims_df = _synthetic_training_frames()

    train_df, val_df, test_df = grouped_temporal_split(features_df, claims_df)

    assert len(train_df) > 0
    assert len(val_df) > 0
    assert len(test_df) > 0
    assert set(train_df["provider_id"]).isdisjoint(set(test_df["provider_id"]))
    assert train_df["claim_receipt_date"].max() <= val_df["claim_receipt_date"].min()
    assert val_df["claim_receipt_date"].max() <= test_df["claim_receipt_date"].min()


def test_train_xgboost_precision_meets_holdout_gate():
    features_df, claims_df = _synthetic_training_frames()
    train_df, val_df, test_df = grouped_temporal_split(features_df, claims_df)

    model, metadata = train_xgboost(train_df, val_df)
    metrics = evaluate_model(model, test_df, threshold=0.3)

    assert metadata["best_iteration"] >= 0
    assert metrics["precision_at_k"]["precision"] >= 0.75
    assert metrics["auc_roc"] >= 0.9
    assert set(metrics["per_anomaly_recall"]) == {"upcoding", "ncci_violation", "duplicate"}
    assert metrics["precision_recall_curve"]


def test_shap_explainer_returns_feature_attributions_for_batch_and_single():
    features_df, claims_df = _synthetic_training_frames()
    train_df, val_df, test_df = grouped_temporal_split(features_df, claims_df)
    model, _ = train_xgboost(train_df, val_df)

    explainer = SHAPExplainer(model, FEATURE_COLUMNS)
    X = test_df[FEATURE_COLUMNS].head(3).to_numpy(dtype=float)

    batch = explainer.explain(X)
    single = explainer.explain_single(X[0])

    assert isinstance(explainer.base_value, float)
    assert len(batch) == 3
    assert set(batch[0]) == set(FEATURE_COLUMNS)
    assert set(single) == set(FEATURE_COLUMNS)


def test_shap_explainer_invariant_violation_raises_and_warns(caplog):
    fake_model = type(
        "FakeModel",
        (),
        {"predict": lambda self, dmatrix, output_margin=True: np.array([0.0])},
    )()
    explainer = SHAPExplainer.__new__(SHAPExplainer)
    explainer.model = fake_model
    explainer.feature_names = ["feature_a", "feature_b"]
    explainer.explainer = lambda X: SimpleNamespace(
        values=np.array([[1.0, 1.0]]),
        base_values=np.array([0.0]),
    )

    with pytest.raises(ValueError, match="SHAP invariant residual"):
        explainer.explain(np.array([[0.4, 0.6]]), strict=True)

    caplog.set_level(logging.WARNING)
    result = explainer.explain(np.array([[0.4, 0.6]]), strict=False)
    assert result == [{"feature_a": 1.0, "feature_b": 1.0}]
    assert "SHAP invariant residual" in caplog.text


def test_batch_score_attaches_shap_rules_and_risk_bands(monkeypatch):
    features_df = pd.DataFrame(
        {
            "claim_id": ["CLM-HIGH", "CLM-LOW"],
            **{column: [0.9, 0.1] for column in FEATURE_COLUMNS},
        }
    )
    claims_df = pd.DataFrame(
        [
            {
                "claim_id": "CLM-HIGH",
                "provider_id": "PRV-001",
                "member_id": "MBR-001",
                "service_date": date(2026, 3, 1),
                "procedure_codes": ["99214"],
                "charge_amount": 220.0,
            },
            {
                "claim_id": "CLM-LOW",
                "provider_id": "PRV-002",
                "member_id": "MBR-002",
                "service_date": date(2026, 3, 2),
                "procedure_codes": ["99213"],
                "charge_amount": 120.0,
            },
        ]
    )

    class _FakeModel:
        def predict(self, dmatrix, **kwargs):
            return np.array([0.91, 0.12])

    class _FakeExplainer:
        def __init__(self, model, feature_names):
            self.feature_names = feature_names

        def explain(self, X, strict=False):
            return [
                {"charge_amount": 0.51, "allowed_amount": 0.22},
                {"charge_amount": -0.18, "allowed_amount": -0.05},
            ]

    monkeypatch.setattr(pipeline_module, "SHAPExplainer", _FakeExplainer)
    monkeypatch.setattr(
        pipeline_module,
        "compute_rules_flags",
        lambda df: pd.DataFrame(
            {
                "claim_id": ["CLM-HIGH", "CLM-LOW"],
                "rules_flags": [["charge_outlier"], []],
            }
        ),
    )

    scored = batch_score(features_df, claims_df, _FakeModel())

    assert list(scored["claim_id"]) == ["CLM-HIGH", "CLM-LOW"]
    assert list(scored["risk_band"]) == ["high", "low"]
    assert scored.iloc[0]["rules_flags"] == ["charge_outlier"]
    assert scored.iloc[0]["shap_values"]["charge_amount"] == 0.51
    assert assign_risk_band(70.0) == "high"
    assert assign_risk_band(40.0) == "medium"
    assert assign_risk_band(39.99) == "low"

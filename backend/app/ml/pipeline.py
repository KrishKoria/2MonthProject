"""End-to-end batch scoring pipeline: features -> model -> SHAP -> risk_band."""

import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import xgboost as xgb

from app.config import settings
from app.ml.explainer import SHAPExplainer
from app.ml.model import FEATURE_COLUMNS, predict_model
from app.ml.rules_baseline import compute_rules_flags

logger = logging.getLogger(__name__)


def assign_risk_band(score: float) -> str:
    """Assign risk band from 0-100 normalized score."""
    if score >= settings.HIGH_RISK_THRESHOLD:
        return "high"
    elif score >= settings.RISK_THRESHOLD:
        return "medium"
    return "low"


def batch_score(
    features_df: pd.DataFrame,
    claims_df: pd.DataFrame,
    model: xgb.Booster,
    feature_cols: list[str] | None = None,
) -> pd.DataFrame:
    """Score all claims and compute SHAP values.

    Returns DataFrame with columns: claim_id, xgboost_score, xgboost_raw_margin,
    shap_values, shap_base_value, rules_flags, risk_band, scored_at
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLUMNS

    X = features_df[feature_cols].values
    claim_ids = features_df["claim_id"].values

    # Raw XGBoost predictions in both probability and margin space.
    dmatrix = xgb.DMatrix(X, feature_names=feature_cols)
    raw_scores = predict_model(model, dmatrix)
    raw_margins = predict_model(model, dmatrix, output_margin=True)

    # Normalize to 0-100
    normalized_scores = (raw_scores * 100).clip(0, 100)

    # SHAP values (strict=False for batch — rationale node uses strict=True)
    explainer = SHAPExplainer(model, feature_cols)
    shap_values_list = explainer.explain(X, strict=False)
    base_value = explainer.base_value

    # Rules baseline flags
    logger.info("Computing rules baseline flags...")
    rules_df = compute_rules_flags(claims_df[claims_df["claim_id"].isin(claim_ids)])
    rules_lookup = dict(zip(rules_df["claim_id"], rules_df["rules_flags"]))

    # Build results
    scored_at = datetime.now(timezone.utc).isoformat()
    records = []
    for i, claim_id in enumerate(claim_ids):
        score = float(normalized_scores[i])
        records.append({
            "claim_id": claim_id,
            "xgboost_score": round(score, 2),
            "xgboost_raw_margin": float(raw_margins[i]),
            "shap_values": shap_values_list[i],
            "shap_base_value": float(base_value),
            "rules_flags": rules_lookup.get(claim_id, []),
            "risk_band": assign_risk_band(score),
            "scored_at": scored_at,
        })

    return pd.DataFrame(records)

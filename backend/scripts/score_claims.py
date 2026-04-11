"""Batch scoring script — scores all claims with XGBoost + SHAP.

Outputs: data/scores/risk_scores.parquet
"""

import logging
import sys
from pathlib import Path

import pandas as pd
import xgboost as xgb

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.ml.model import FEATURE_COLUMNS
from app.ml.pipeline import batch_score

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    data_dir = Path(__file__).parent.parent.parent / "data"
    scores_dir = data_dir / "scores"
    scores_dir.mkdir(parents=True, exist_ok=True)

    # Load model
    model_path = scores_dir / "xgboost_model.json"
    if not model_path.exists():
        logger.error("Model not found at %s. Run train_model.py first.", model_path)
        sys.exit(1)

    model = xgb.Booster()
    model.load_model(str(model_path))
    logger.info("Loaded model from %s", model_path)

    # Load claims
    claims_df = pd.read_parquet(data_dir / "processed" / "medical_claims.parquet")
    logger.info("Loaded %d claims", len(claims_df))

    # Load pre-computed features
    features_path = data_dir / "features" / "claim_features.parquet"
    if not features_path.exists():
        logger.error("Features not found at %s. Run train_model.py first.", features_path)
        sys.exit(1)

    features_df = pd.read_parquet(features_path)
    logger.info("Loaded features for %d claims", len(features_df))

    # Fill NaN features with 0
    for col in FEATURE_COLUMNS:
        if col in features_df.columns:
            features_df[col] = features_df[col].fillna(0.0)

    # Score
    logger.info("Scoring claims...")
    scores_df = batch_score(features_df, claims_df, model)
    logger.info("Scored %d claims", len(scores_df))

    # Validate output schema
    required_cols = ["claim_id", "xgboost_score", "shap_values", "rules_flags", "risk_band", "scored_at"]
    missing = [c for c in required_cols if c not in scores_df.columns]
    if missing:
        logger.error("Missing required columns: %s", missing)
        sys.exit(1)

    if scores_df["claim_id"].isna().any():
        logger.error("Null claim_ids in scores")
        sys.exit(1)

    # Save
    output_path = scores_dir / "risk_scores.parquet"
    scores_df.to_parquet(output_path, index=False)
    logger.info("Saved risk scores to %s", output_path)

    # Summary
    band_counts = scores_df["risk_band"].value_counts()
    logger.info("Risk band distribution:\n%s", band_counts)
    logger.info("Scoring complete!")


if __name__ == "__main__":
    main()

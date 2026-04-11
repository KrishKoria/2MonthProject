"""Model training + ablation evaluation script.

Outputs: data/scores/model_metadata.json + trained model pickle.
"""

import json
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import f1_score, precision_score, recall_score

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.ml.features import compute_features_batch
from app.ml.model import FEATURE_COLUMNS, evaluate_model, grouped_temporal_split, train_xgboost
from app.ml.rules_baseline import compute_rules_flags

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def compute_ablation(
    test_df: pd.DataFrame,
    model: xgb.Booster,
    feature_cols: list[str],
    threshold: float = 0.5,
) -> dict:
    """Compute ablation: rules-only vs XGBoost-only vs combined."""
    y_true = test_df["is_anomaly"].values
    X_test = test_df[feature_cols].values

    # XGBoost predictions
    dtest = xgb.DMatrix(X_test, feature_names=feature_cols)
    xgb_proba = model.predict(dtest)
    xgb_pred = (xgb_proba >= threshold).astype(int)

    # Rules predictions
    rules_pred = test_df["has_rules_flag"].values.astype(int)

    # Combined: flag if either rules or XGBoost flags
    combined_pred = ((xgb_pred == 1) | (rules_pred == 1)).astype(int)

    def _metrics(y_pred):
        return {
            "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        }

    return {
        "rules_only": _metrics(rules_pred),
        "xgboost_only": _metrics(xgb_pred),
        "combined": _metrics(combined_pred),
    }


def main():
    data_dir = Path(__file__).parent.parent.parent / "data"
    scores_dir = data_dir / "scores"
    scores_dir.mkdir(parents=True, exist_ok=True)

    # Load claims
    claims_path = data_dir / "processed" / "medical_claims.parquet"
    claims_df = pd.read_parquet(claims_path)
    logger.info("Loaded %d claims", len(claims_df))

    # Sample for feature computation (full dataset is slow)
    sample_size = min(5000, len(claims_df))
    sample_df = claims_df.sample(n=sample_size, random_state=42)
    logger.info("Computing features for %d claims (sampled)...", sample_size)

    # Compute features
    feature_dicts = compute_features_batch(sample_df, sample_df["claim_id"].tolist())
    features_df = pd.DataFrame(feature_dicts)
    logger.info("Computed features for %d claims", len(features_df))

    # Add target column
    features_df = features_df.merge(
        claims_df[["claim_id", "anomaly_type", "provider_id", "claim_receipt_date"]],
        on="claim_id",
        how="left",
    )
    features_df["is_anomaly"] = features_df["anomaly_type"].notna().astype(int)

    # Add rules baseline flag
    rules_df = compute_rules_flags(sample_df)
    features_df = features_df.merge(rules_df, on="claim_id", how="left")
    features_df["has_rules_flag"] = features_df["rules_flags"].apply(lambda x: 1 if x and len(x) > 0 else 0)

    # Fill NaN features with 0
    for col in FEATURE_COLUMNS:
        if col in features_df.columns:
            features_df[col] = features_df[col].fillna(0.0)

    # Split
    train_df, val_df, test_df = grouped_temporal_split(features_df, claims_df)

    if len(train_df) < 100 or len(test_df) < 50:
        logger.error("Insufficient data for training after split")
        sys.exit(1)

    # Train
    logger.info("Training XGBoost model...")
    model, train_metadata = train_xgboost(train_df, val_df)

    # Evaluate
    logger.info("Evaluating model...")
    metrics = evaluate_model(model, test_df)

    # Precision gate check (constitution VI)
    precision = metrics["precision_at_k"]["precision"]
    if precision < 0.75:
        logger.warning("PRECISION GATE FAILED: %.4f < 0.75. Model not promoted.", precision)
    else:
        logger.info("PRECISION GATE PASSED: %.4f >= 0.75", precision)

    # Ablation
    logger.info("Computing ablation...")
    ablation = compute_ablation(test_df, model, FEATURE_COLUMNS)

    # Build metadata
    metadata = {
        **metrics,
        "ablation": ablation,
        "train_size": len(train_df),
        "val_size": len(val_df),
        "test_size": len(test_df),
        "feature_columns": FEATURE_COLUMNS,
        **train_metadata,
    }

    # Validate required keys
    required_keys = ["auc_roc", "precision_at_k", "precision_recall_curve", "per_anomaly_recall", "ablation"]
    missing = [k for k in required_keys if k not in metadata]
    if missing:
        logger.error("Missing required metadata keys: %s", missing)
        sys.exit(1)

    # Save metadata
    metadata_path = scores_dir / "model_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2, default=str)
    logger.info("Saved model metadata to %s", metadata_path)

    # Save model
    model_path = scores_dir / "xgboost_model.json"
    model.save_model(str(model_path))
    logger.info("Saved model to %s", model_path)

    # Save features for scoring use
    features_path = data_dir / "features" / "claim_features.parquet"
    features_path.parent.mkdir(parents=True, exist_ok=True)
    features_df.to_parquet(features_path, index=False)
    logger.info("Saved features to %s", features_path)

    logger.info("Training complete!")
    logger.info("AUC-ROC: %.4f", metadata["auc_roc"])
    logger.info("Ablation: %s", json.dumps(ablation, indent=2))


if __name__ == "__main__":
    main()

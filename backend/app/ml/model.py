"""XGBoost model training with grouped temporal split.

Constitution: Precision gate >= 0.75 at operating threshold. No provider in both train and test.
"""

import logging

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    auc,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "charge_amount", "allowed_amount", "paid_amount", "charge_to_allowed_ratio",
    "num_procedure_codes", "num_diagnosis_codes", "num_modifiers",
    "days_between_service_and_submission", "place_of_service_encoded",
    "procedure_complexity_score", "has_ncci_conflict", "modifier_count",
    "modifier_59_present", "provider_avg_charge_30d", "provider_claim_volume_30d",
    "provider_specialty_charge_percentile", "provider_unique_patients_30d",
    "provider_procedure_concentration", "provider_peer_deviation",
    "member_claim_frequency_90d", "member_unique_providers_90d",
    "member_avg_charge_90d", "member_chronic_condition_count",
]


def grouped_temporal_split(
    features_df: pd.DataFrame,
    claims_df: pd.DataFrame,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split by claim_receipt_date with provider group constraint.

    70/15/15 split. No provider appears in both train and test.
    """
    # Merge receipt dates
    merged = features_df.merge(
        claims_df[["claim_id", "claim_receipt_date", "provider_id"]],
        on="claim_id",
        how="left",
    )
    merged = merged.sort_values("claim_receipt_date")

    n = len(merged)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train = merged.iloc[:train_end]
    val = merged.iloc[train_end:val_end]
    test = merged.iloc[val_end:]

    # Provider group constraint: remove test claims whose providers are in train
    train_providers = set(train["provider_id"].unique())
    test = test[~test["provider_id"].isin(train_providers)]

    logger.info("Split sizes — train: %d, val: %d, test: %d", len(train), len(val), len(test))
    return train, val, test


def train_xgboost(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    feature_cols: list[str] | None = None,
    target_col: str = "is_anomaly",
) -> tuple[xgb.Booster, dict]:
    """Train XGBoost model with early stopping.

    Returns (model, metadata) where metadata includes eval metrics.
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLUMNS

    X_train = train_df[feature_cols].values
    y_train = train_df[target_col].values
    X_val = val_df[feature_cols].values
    y_val = val_df[target_col].values

    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=feature_cols)
    dval = xgb.DMatrix(X_val, label=y_val, feature_names=feature_cols)

    params = {
        "objective": "binary:logistic",
        "eval_metric": ["logloss", "auc"],
        "max_depth": 6,
        "learning_rate": 0.1,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 5,
        "seed": 42,
    }

    model = xgb.train(
        params,
        dtrain,
        num_boost_round=200,
        evals=[(dtrain, "train"), (dval, "val")],
        early_stopping_rounds=20,
        verbose_eval=False,
    )

    metadata = {"params": params, "best_iteration": model.best_iteration}
    return model, metadata


def evaluate_model(
    model: xgb.Booster,
    test_df: pd.DataFrame,
    feature_cols: list[str] | None = None,
    target_col: str = "is_anomaly",
    threshold: float = 0.5,
) -> dict:
    """Evaluate model on test set.

    Returns metrics dict with auc_roc, precision_at_k, precision_recall_curve, per_anomaly_recall.
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLUMNS

    X_test = test_df[feature_cols].values
    y_test = test_df[target_col].values

    dtest = xgb.DMatrix(X_test, feature_names=feature_cols)
    y_pred_proba = model.predict(dtest)
    y_pred = (y_pred_proba >= threshold).astype(int)

    # AUC-ROC
    auc_roc = float(roc_auc_score(y_test, y_pred_proba))

    # Precision-recall curve
    precisions, recalls, thresholds = precision_recall_curve(y_test, y_pred_proba)
    pr_auc = float(auc(recalls, precisions))

    # Sample PR curve points
    pr_curve = []
    for t in np.arange(0.1, 1.0, 0.05):
        y_at_t = (y_pred_proba >= t).astype(int)
        p = float(precision_score(y_test, y_at_t, zero_division=0))
        r = float(recall_score(y_test, y_at_t, zero_division=0))
        pr_curve.append({"threshold": round(float(t), 2), "precision": round(p, 4), "recall": round(r, 4)})

    # Precision at operating threshold
    precision_at_threshold = float(precision_score(y_test, y_pred, zero_division=0))

    # Per anomaly type recall
    per_anomaly_recall = {}
    if "anomaly_type" in test_df.columns:
        for anomaly_type in ["upcoding", "ncci_violation", "duplicate"]:
            mask = test_df["anomaly_type"] == anomaly_type
            if mask.any():
                per_anomaly_recall[anomaly_type] = float(recall_score(
                    y_test[mask], y_pred[mask], zero_division=0
                ))

    metrics = {
        "auc_roc": round(auc_roc, 4),
        "pr_auc": round(pr_auc, 4),
        "precision_at_k": {"k": int(sum(y_pred)), "precision": round(precision_at_threshold, 4)},
        "precision_recall_curve": pr_curve,
        "per_anomaly_recall": per_anomaly_recall,
        "threshold": threshold,
    }

    logger.info("AUC-ROC: %.4f, Precision@threshold: %.4f", auc_roc, precision_at_threshold)
    return metrics

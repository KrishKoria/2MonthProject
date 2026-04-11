"""Validate anomaly distribution and Parquet schema after data generation."""

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def validate_claims(claims_df: pd.DataFrame) -> list[str]:
    """Validate claims schema and data quality."""
    errors = []

    required_cols = [
        "claim_id", "member_id", "provider_id", "service_date",
        "claim_receipt_date", "procedure_codes", "diagnosis_codes",
        "charge_amount", "allowed_amount", "paid_amount",
        "place_of_service", "claim_status", "anomaly_type",
    ]
    for col in required_cols:
        if col not in claims_df.columns:
            errors.append(f"Missing column: {col}")

    if claims_df["claim_id"].duplicated().any():
        n_dups = claims_df["claim_id"].duplicated().sum()
        errors.append(f"Duplicate claim_ids: {n_dups}")

    if claims_df["claim_id"].isna().any():
        errors.append("Null claim_ids found")

    return errors


def validate_anomaly_distribution(claims_df: pd.DataFrame, labels_df: pd.DataFrame) -> list[str]:
    """Validate anomaly injection distribution."""
    errors = []

    anomaly_counts = claims_df["anomaly_type"].value_counts()
    logger.info("Anomaly distribution:\n%s", anomaly_counts)

    total_flagged = claims_df["anomaly_type"].notna().sum()
    total = len(claims_df)
    flag_rate = total_flagged / total if total > 0 else 0
    logger.info("Total flagged: %d / %d (%.1f%%)", total_flagged, total, flag_rate * 100)

    expected_types = {"upcoding", "ncci_violation", "duplicate"}
    actual_types = set(claims_df["anomaly_type"].dropna().unique())
    missing = expected_types - actual_types
    if missing:
        errors.append(f"Missing anomaly types: {missing}")

    # Validate labels
    if len(labels_df) > 0:
        split_counts = labels_df["split"].value_counts()
        logger.info("Labels by split:\n%s", split_counts)

        label_types = labels_df["anomaly_type"].value_counts()
        logger.info("Labels by type:\n%s", label_types)

    return errors


def main():
    parser = argparse.ArgumentParser(description="Validate generated data")
    parser.add_argument("--data-dir", type=str, default="./data", help="Data directory")
    args = parser.parse_args()

    processed_dir = Path(args.data_dir) / "processed"
    all_errors = []

    # Validate claims
    claims_path = processed_dir / "medical_claims.parquet"
    if not claims_path.exists():
        logger.error("Claims file not found: %s", claims_path)
        sys.exit(1)

    claims_df = pd.read_parquet(claims_path)
    logger.info("Loaded %d claims", len(claims_df))
    all_errors.extend(validate_claims(claims_df))

    # Validate anomaly labels
    labels_path = processed_dir / "anomaly_labels.parquet"
    labels_df = pd.read_parquet(labels_path) if labels_path.exists() else pd.DataFrame()
    all_errors.extend(validate_anomaly_distribution(claims_df, labels_df))

    # Validate provider roster
    providers_path = processed_dir / "provider_roster.parquet"
    if providers_path.exists():
        providers_df = pd.read_parquet(providers_path)
        logger.info("Provider roster: %d providers", len(providers_df))
    else:
        all_errors.append("Provider roster not found")

    if all_errors:
        logger.error("Validation FAILED with %d errors:", len(all_errors))
        for err in all_errors:
            logger.error("  - %s", err)
        sys.exit(1)
    else:
        logger.info("Validation PASSED")


if __name__ == "__main__":
    main()

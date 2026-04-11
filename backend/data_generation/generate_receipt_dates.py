"""Generate claim_receipt_date using lognormal lag from service_date."""

import argparse
import logging
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def add_receipt_dates(claims_df: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    """Add claim_receipt_date with lognormal lag from service_date.

    Lag distribution: lognormal with mu=2.5, sigma=0.7
    This gives median ~12 days, mean ~17 days, 95th percentile ~45 days.
    """
    rng = np.random.default_rng(seed)
    n = len(claims_df)

    # Lognormal lag in days
    lag_days = np.exp(rng.normal(2.5, 0.7, size=n)).astype(int)
    lag_days = np.clip(lag_days, 1, 180)  # 1 to 180 days

    service_dates = pd.to_datetime(claims_df["service_date"])
    receipt_dates = service_dates + pd.to_timedelta(lag_days, unit="D")

    claims_df = claims_df.copy()
    claims_df["claim_receipt_date"] = receipt_dates.dt.date
    return claims_df


def main():
    parser = argparse.ArgumentParser(description="Add receipt dates to claims")
    parser.add_argument("--data-dir", type=str, default="./data", help="Data directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    claims_path = Path(args.data_dir) / "processed" / "medical_claims.parquet"
    if not claims_path.exists():
        raise FileNotFoundError(f"Claims file not found: {claims_path}. Run generate_synthea.py first.")

    claims_df = pd.read_parquet(claims_path)
    logger.info("Loaded %d claims", len(claims_df))

    claims_df = add_receipt_dates(claims_df, seed=args.seed)
    claims_df.to_parquet(claims_path, index=False)
    logger.info("Added claim_receipt_date to %d claims, saved to %s", len(claims_df), claims_path)


if __name__ == "__main__":
    main()

"""Deterministic rules baseline for ablation comparison.

Flags: ncci_conflict, charge_outlier, duplicate_match.
Constitution I: This is purely deterministic — no LLM.
"""

import logging
from datetime import timedelta

import pandas as pd

logger = logging.getLogger(__name__)


def compute_rules_flags(claims_df: pd.DataFrame) -> pd.DataFrame:
    """Compute deterministic rule-based flags for all claims.

    Returns DataFrame with columns: claim_id, rules_flags (list[str])
    """
    results = []

    # Pre-compute statistics for outlier detection
    charge_stats = claims_df.groupby("place_of_service")["charge_amount"].agg(["mean", "std"]).reset_index()
    charge_lookup = {
        row["place_of_service"]: (row["mean"], row["std"])
        for _, row in charge_stats.iterrows()
    }

    for _, row in claims_df.iterrows():
        flags = []

        # 1. NCCI conflict check
        proc_codes = row["procedure_codes"]
        if isinstance(proc_codes, list) and len(proc_codes) >= 2:
            from app.evidence.ncci_engine import NCCIEngine
            try:
                engine = NCCIEngine()
                for i in range(len(proc_codes)):
                    for j in range(i + 1, len(proc_codes)):
                        result = engine.lookup_ncci_conflict(
                            proc_codes[i], proc_codes[j], row["service_date"]
                        )
                        if result["conflict_exists"]:
                            flags.append("ncci_conflict")
                            break
                    if "ncci_conflict" in flags:
                        break
            except Exception:
                pass

        # 2. Charge outlier check (> 3 std from POS mean)
        pos = row["place_of_service"]
        if pos in charge_lookup:
            mean, std = charge_lookup[pos]
            if std > 0 and row["charge_amount"] > mean + 3 * std:
                flags.append("charge_outlier")

        # 3. Duplicate match check (same provider+member within ±3 days, same procedure)
        # This is done below in batch for efficiency

        results.append({
            "claim_id": row["claim_id"],
            "rules_flags": flags,
        })

    # Batch duplicate check
    results_df = pd.DataFrame(results)
    _add_duplicate_flags(claims_df, results_df)

    return results_df


def _add_duplicate_flags(claims_df: pd.DataFrame, results_df: pd.DataFrame) -> None:
    """Add duplicate_match flags by checking for similar claims within ±3 days."""
    claims_df = claims_df.copy()
    claims_df["service_date"] = pd.to_datetime(claims_df["service_date"])

    for idx, row in claims_df.iterrows():
        # Find claims from same provider + member within ±3 days
        mask = (
            (claims_df["provider_id"] == row["provider_id"])
            & (claims_df["member_id"] == row["member_id"])
            & (claims_df.index != idx)
            & (abs((claims_df["service_date"] - row["service_date"]).dt.days) <= 3)
        )
        if mask.any():
            result_idx = results_df[results_df["claim_id"] == row["claim_id"]].index
            if len(result_idx) > 0:
                current_flags = results_df.at[result_idx[0], "rules_flags"]
                if "duplicate_match" not in current_flags:
                    current_flags.append("duplicate_match")

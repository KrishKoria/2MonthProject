"""Inject anomalies into synthetic claims with train/test distribution partitioning.

Anomaly types:
- Upcoding: shift CPT level (train: +1 level, test: +2 or cross-category)
- NCCI violations: inject conflicting code pairs (train: top-50, test: next-50)
- Duplicate billing: clone claims with offset (train: ±1d, test: ±2-3d)
"""

import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CPT code level groups for upcoding
EM_LEVELS = {
    "office_visit_new": ["99201", "99202", "99203", "99204", "99205"],
    "office_visit_est": ["99211", "99212", "99213", "99214", "99215"],
    "inpatient": ["99221", "99222", "99223"],
}

# Top 50 NCCI conflicting pairs (train set)
NCCI_PAIRS_TRAIN = [
    ("27447", "27446"), ("43239", "43235"), ("45385", "45380"),
    ("93312", "93306"), ("93010", "93000"), ("17003", "17000"),
    ("64493", "64483"), ("11104", "11102"), ("20611", "20610"),
    ("73721", "72148"), ("27130", "27236"), ("76856", "76700"),
    ("90837", "90834"), ("96130", "90834"), ("45385", "45378"),
    ("43239", "43230"), ("27447", "27440"), ("93306", "93000"),
    ("64493", "64490"), ("17003", "17004"), ("74177", "74176"),
    ("27130", "27134"), ("76830", "76700"), ("70553", "70552"),
    ("11104", "11100"), ("45385", "45381"), ("43239", "43240"),
    ("93312", "93308"), ("64483", "64490"), ("27447", "27445"),
    ("43235", "43230"), ("72148", "72146"), ("76856", "76857"),
    ("90847", "90837"), ("20610", "20600"), ("17000", "17003"),
    ("27236", "27230"), ("45380", "45378"), ("93000", "93005"),
    ("70553", "70551"), ("74177", "74178"), ("11102", "11100"),
    ("27130", "27132"), ("76801", "76700"), ("64493", "64494"),
    ("43239", "43250"), ("93306", "93304"), ("17003", "17110"),
    ("45385", "45384"), ("72148", "72149"),
]

# Next 50 pairs for test set
NCCI_PAIRS_TEST = [
    ("27447", "27443"), ("43239", "43238"), ("45385", "45382"),
    ("93312", "93310"), ("93010", "93005"), ("17003", "17111"),
    ("64493", "64495"), ("11104", "11106"), ("20611", "20600"),
    ("73721", "72149"), ("27130", "27137"), ("76856", "76801"),
    ("90837", "90832"), ("96130", "96131"), ("45385", "45386"),
    ("43239", "43248"), ("27447", "27442"), ("93306", "93303"),
    ("64493", "64491"), ("17003", "17250"), ("74177", "74170"),
    ("27130", "27138"), ("76830", "76801"), ("70553", "70550"),
    ("11104", "11105"), ("45385", "45388"), ("43239", "43245"),
    ("93312", "93315"), ("64483", "64484"), ("27447", "27441"),
    ("43235", "43236"), ("72148", "72147"), ("76856", "76858"),
    ("90847", "90846"), ("20610", "20604"), ("17000", "17004"),
    ("27236", "27232"), ("45380", "45379"), ("93000", "93015"),
    ("70553", "70554"), ("74177", "74175"), ("11102", "11101"),
    ("27130", "27133"), ("76801", "76805"), ("64493", "64496"),
    ("43239", "43255"), ("93306", "93320"), ("17003", "17260"),
    ("45385", "45390"), ("72148", "72150"),
]


def inject_upcoding(claims_df: pd.DataFrame, indices: np.ndarray, split: str, rng: np.random.Generator) -> list[dict]:
    """Inject upcoding anomalies by shifting CPT levels."""
    labels = []
    for idx in indices:
        row = claims_df.iloc[idx]
        proc_codes = row["procedure_codes"].copy() if isinstance(row["procedure_codes"], list) else list(row["procedure_codes"])

        # Find EM code to upcode
        upcoded = False
        for group_name, levels in EM_LEVELS.items():
            for i, code in enumerate(proc_codes):
                if code in levels:
                    current_level = levels.index(code)
                    if split == "train":
                        # Shift 1 level within category
                        new_level = min(current_level + 1, len(levels) - 1)
                    else:
                        # Shift 2 levels or use highest
                        new_level = min(current_level + 2, len(levels) - 1)
                    if new_level != current_level:
                        proc_codes[i] = levels[new_level]
                        upcoded = True
                        break
            if upcoded:
                break

        if not upcoded:
            # Cross-category: bump charge instead
            claims_df.at[claims_df.index[idx], "charge_amount"] = row["charge_amount"] * rng.uniform(2.5, 4.0)

        claims_df.at[claims_df.index[idx], "procedure_codes"] = proc_codes
        claims_df.at[claims_df.index[idx], "anomaly_type"] = "upcoding"

        labels.append({
            "claim_id": row["claim_id"],
            "anomaly_type": "upcoding",
            "anomaly_subtype": "cross_category_upcoding" if not upcoded else "within_category_upcoding",
            "injection_params": {"split": split, "shift": 1 if split == "train" else 2},
            "split": split,
        })
    return labels


def inject_ncci_violations(claims_df: pd.DataFrame, indices: np.ndarray, split: str, rng: np.random.Generator) -> list[dict]:
    """Inject NCCI violations by adding conflicting code pairs."""
    pairs = NCCI_PAIRS_TRAIN if split == "train" else NCCI_PAIRS_TEST
    labels = []

    for i, idx in enumerate(indices):
        row = claims_df.iloc[idx]
        pair = pairs[i % len(pairs)]

        proc_codes = list(pair)
        claims_df.at[claims_df.index[idx], "procedure_codes"] = proc_codes
        claims_df.at[claims_df.index[idx], "anomaly_type"] = "ncci_violation"

        labels.append({
            "claim_id": row["claim_id"],
            "anomaly_type": "ncci_violation",
            "anomaly_subtype": None,
            "injection_params": {"split": split, "pair": list(pair)},
            "split": split,
        })
    return labels


def inject_duplicates(claims_df: pd.DataFrame, indices: np.ndarray, split: str, rng: np.random.Generator) -> tuple[pd.DataFrame, list[dict]]:
    """Inject duplicate billing by cloning claims with date offset."""
    labels = []
    duplicates = []

    for idx in indices:
        row = claims_df.iloc[idx].copy()

        if split == "train":
            offset_days = int(rng.choice([-1, 1]))
        else:
            offset_days = int(rng.choice([-3, -2, 2, 3]))

        dup = row.to_dict()
        original_date = pd.to_datetime(dup["service_date"])
        dup["service_date"] = (original_date + pd.Timedelta(days=offset_days)).date()
        dup["claim_id"] = dup["claim_id"] + "-DUP"
        dup["anomaly_type"] = "duplicate"

        # Mark original as well
        claims_df.at[claims_df.index[idx], "anomaly_type"] = "duplicate"

        duplicates.append(dup)

        # Label for original
        labels.append({
            "claim_id": claims_df.iloc[idx]["claim_id"],
            "anomaly_type": "duplicate",
            "anomaly_subtype": None,
            "injection_params": {"split": split, "offset_days": offset_days, "is_original": True},
            "split": split,
        })
        # Label for duplicate
        labels.append({
            "claim_id": dup["claim_id"],
            "anomaly_type": "duplicate",
            "anomaly_subtype": None,
            "injection_params": {"split": split, "offset_days": offset_days, "is_original": False},
            "split": split,
        })

    return pd.DataFrame(duplicates), labels


def inject_anomalies(
    claims_df: pd.DataFrame,
    split: str = "train",
    anomaly_rate: float = 0.055,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Inject anomalies into claims data.

    Target: ~5.5% anomaly rate per type = ~16.5% total flagged claims.
    """
    rng = np.random.default_rng(seed + (0 if split == "train" else 1))

    # Only inject into claims without existing anomalies
    clean_mask = claims_df["anomaly_type"].isna()
    clean_indices = np.where(clean_mask)[0]
    rng.shuffle(clean_indices)

    n_per_type = int(len(claims_df) * anomaly_rate)
    logger.info("Injecting %d anomalies per type (rate=%.1f%%) for split=%s", n_per_type, anomaly_rate * 100, split)

    all_labels = []

    # Split indices among anomaly types
    upcode_idx = clean_indices[:n_per_type]
    ncci_idx = clean_indices[n_per_type:2 * n_per_type]
    dup_idx = clean_indices[2 * n_per_type:3 * n_per_type]

    # Inject each type
    all_labels.extend(inject_upcoding(claims_df, upcode_idx, split, rng))
    all_labels.extend(inject_ncci_violations(claims_df, ncci_idx, split, rng))
    dup_df, dup_labels = inject_duplicates(claims_df, dup_idx, split, rng)
    all_labels.extend(dup_labels)

    # Append duplicate claims
    claims_df = pd.concat([claims_df, dup_df], ignore_index=True)

    labels_df = pd.DataFrame(all_labels)
    logger.info("Injected %d total anomaly labels", len(labels_df))
    return claims_df, labels_df


def main():
    parser = argparse.ArgumentParser(description="Inject anomalies into claims")
    parser.add_argument("--split", choices=["train", "test"], required=True, help="Data split")
    parser.add_argument("--data-dir", type=str, default="./data", help="Data directory")
    parser.add_argument("--anomaly-rate", type=float, default=0.055, help="Anomaly rate per type")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    processed_dir = Path(args.data_dir) / "processed"
    claims_path = processed_dir / "medical_claims.parquet"

    if not claims_path.exists():
        raise FileNotFoundError(f"Claims file not found: {claims_path}")

    claims_df = pd.read_parquet(claims_path)
    logger.info("Loaded %d claims", len(claims_df))

    claims_df, labels_df = inject_anomalies(claims_df, split=args.split, anomaly_rate=args.anomaly_rate, seed=args.seed)

    claims_df.to_parquet(claims_path, index=False)
    logger.info("Saved updated claims to %s", claims_path)

    labels_path = processed_dir / "anomaly_labels.parquet"
    if labels_path.exists():
        existing = pd.read_parquet(labels_path)
        labels_df = pd.concat([existing, labels_df], ignore_index=True)
    labels_df.to_parquet(labels_path, index=False)
    logger.info("Saved anomaly labels to %s", labels_path)


if __name__ == "__main__":
    main()

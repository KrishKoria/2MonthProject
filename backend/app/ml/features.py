"""Point-in-time feature engineering using Polars lazy evaluation.

Constitution II: All lookback windows anchored to claim_receipt_date with strict < inequality.
Constitution VII: All 23 features from manifest must be computed or raise FeatureComputationError.
"""

import logging
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import polars as pl
import yaml

from app.evidence.ncci_engine import NCCIEngine

logger = logging.getLogger(__name__)

MANIFEST_PATH = Path(__file__).parent.parent.parent.parent / "src" / "features" / "manifest.yml"

# Deterministic ordinal encoding for CMS Place-of-Service codes. Values are fixed so the
# trained model sees the same encoding at inference time across processes (Python's built-in
# hash() is randomized per interpreter and must not be used for persisted ML features).
# Codes sourced from CMS Place of Service code set. Unknown codes map to 0.
PLACE_OF_SERVICE_ENCODING: dict[str, int] = {
    "01": 1, "02": 2, "03": 3, "04": 4, "05": 5, "06": 6, "07": 7, "08": 8, "09": 9,
    "11": 10, "12": 11, "13": 12, "14": 13, "15": 14, "16": 15, "17": 16, "18": 17,
    "19": 18, "20": 19, "21": 20, "22": 21, "23": 22, "24": 23, "25": 24, "26": 25,
    "31": 26, "32": 27, "33": 28, "34": 29, "41": 30, "42": 31, "49": 32, "50": 33,
    "51": 34, "52": 35, "53": 36, "54": 37, "55": 38, "56": 39, "57": 40, "58": 41,
    "60": 42, "61": 43, "62": 44, "65": 45, "71": 46, "72": 47, "81": 48, "99": 49,
    "10": 50, "27": 51,
}


class FeatureComputationError(Exception):
    """Raised when a required feature cannot be computed."""


@lru_cache(maxsize=1)
def _ncci_engine() -> NCCIEngine:
    """Singleton NCCI engine — avoids reloading the CSV per feature call."""
    return NCCIEngine()


def _load_manifest() -> list[str]:
    """Load all feature names from manifest.yml."""
    with open(MANIFEST_PATH) as f:
        manifest = yaml.safe_load(f)
    all_features = []
    for group in ["claim_features", "provider_features", "member_features"]:
        all_features.extend(manifest.get(group, []))
    return all_features


def compute_features(claims_df, target_claim_id: str) -> dict[str, float]:
    """Compute all 23 features for a single claim using point-in-time lookback.

    Uses strict < inequality on claim_receipt_date to prevent future leakage.

    Args:
        claims_df: DataFrame with all claims (pandas)
        target_claim_id: The claim to compute features for

    Returns:
        dict mapping feature name to value

    Raises:
        FeatureComputationError: If a required feature cannot be computed
    """
    # Convert to Polars for lazy evaluation
    if not isinstance(claims_df, pl.DataFrame):
        lf = pl.from_pandas(claims_df).lazy()
    else:
        lf = claims_df.lazy()

    # Get target claim
    target = lf.filter(pl.col("claim_id") == target_claim_id).collect()
    if len(target) == 0:
        raise FeatureComputationError(f"Claim {target_claim_id} not found")
    target_row = target.row(0, named=True)

    receipt_date = target_row["claim_receipt_date"]
    if isinstance(receipt_date, str):
        receipt_date = date.fromisoformat(receipt_date)

    provider_id = target_row["provider_id"]
    member_id = target_row["member_id"]

    # === Claim-level features (from target claim only) ===
    features: dict[str, float] = {}

    charge = float(target_row["charge_amount"])
    allowed = float(target_row["allowed_amount"])
    paid = float(target_row["paid_amount"])

    features["charge_amount"] = charge
    features["allowed_amount"] = allowed
    features["paid_amount"] = paid
    features["charge_to_allowed_ratio"] = charge / allowed if allowed > 0 else 0.0

    proc_codes = target_row["procedure_codes"]
    if isinstance(proc_codes, str):
        proc_codes = proc_codes.strip("[]").replace("'", "").replace('"', '').split(", ") if proc_codes else []
    features["num_procedure_codes"] = float(len(proc_codes))

    diag_codes = target_row["diagnosis_codes"]
    if isinstance(diag_codes, str):
        diag_codes = diag_codes.strip("[]").replace("'", "").replace('"', '').split(", ") if diag_codes else []
    features["num_diagnosis_codes"] = float(len(diag_codes))

    modifiers = target_row["modifiers"]
    if isinstance(modifiers, str):
        modifiers = modifiers.strip("[]").replace("'", "").replace('"', '').split(", ") if modifiers else []
    modifiers = [m for m in modifiers if m.strip()]
    features["num_modifiers"] = float(len(modifiers))
    features["modifier_59_present"] = 1.0 if "59" in modifiers else 0.0

    service_date = target_row["service_date"]
    if isinstance(service_date, str):
        service_date = date.fromisoformat(service_date)
    days_gap = (receipt_date - service_date).days if isinstance(receipt_date, date) and isinstance(service_date, date) else 0
    features["days_between_service_and_submission"] = float(days_gap)

    pos = str(target_row["place_of_service"]) if target_row["place_of_service"] is not None else ""
    features["place_of_service_encoded"] = float(PLACE_OF_SERVICE_ENCODING.get(pos, 0))

    features["procedure_complexity_score"] = float(len(proc_codes)) * 1.5 + float(len(modifiers)) * 0.5

    # Check for NCCI conflict in procedure codes.
    # Uses a module-level cached engine (singleton) so the CSV isn't reloaded per call.
    # Failures here propagate as FeatureComputationError rather than silently degrading to 0.
    has_conflict = 0.0
    if len(proc_codes) >= 2:
        engine = _ncci_engine()
        try:
            for i in range(len(proc_codes)):
                for j in range(i + 1, len(proc_codes)):
                    result = engine.lookup_ncci_conflict(proc_codes[i], proc_codes[j], service_date)
                    if result.get("conflict_exists", False):
                        has_conflict = 1.0
                        break
                if has_conflict:
                    break
        except (KeyError, ValueError, TypeError) as exc:
            raise FeatureComputationError(f"NCCI lookup failed for {target_claim_id}: {exc}") from exc
    features["has_ncci_conflict"] = has_conflict

    # === Provider aggregate features (30-day lookback, strict <) ===
    # CRITICAL: Only include claims with claim_receipt_date STRICTLY BEFORE target's receipt_date
    lookback_30d = receipt_date - timedelta(days=30) if isinstance(receipt_date, date) else receipt_date

    provider_history = lf.filter(
        (pl.col("provider_id") == provider_id)
        & (pl.col("claim_receipt_date") < receipt_date)  # STRICT < (constitution II)
        & (pl.col("claim_receipt_date") >= lookback_30d)
    ).collect()

    if len(provider_history) > 0:
        features["provider_avg_charge_30d"] = float(provider_history["charge_amount"].mean())
        features["provider_claim_volume_30d"] = float(len(provider_history))

        # Specialty charge percentile: ratio of provider avg to overall avg
        all_charges = lf.filter(pl.col("claim_receipt_date") < receipt_date).select("charge_amount").collect()
        overall_avg = float(all_charges["charge_amount"].mean()) if len(all_charges) > 0 else 1.0
        prov_avg = features["provider_avg_charge_30d"]
        features["provider_specialty_charge_percentile"] = prov_avg / overall_avg if overall_avg > 0 else 0.0

        unique_patients = provider_history["member_id"].n_unique()
        features["provider_unique_patients_30d"] = float(unique_patients)

        # Procedure concentration: how concentrated is the provider's procedure mix
        proc_counts = {}
        for row in provider_history.iter_rows(named=True):
            codes = row["procedure_codes"]
            if isinstance(codes, list):
                for c in codes:
                    proc_counts[c] = proc_counts.get(c, 0) + 1
        total_procs = sum(proc_counts.values())
        if total_procs > 0:
            max_proc = max(proc_counts.values())
            features["provider_procedure_concentration"] = float(max_proc) / total_procs
        else:
            features["provider_procedure_concentration"] = 0.0

        features["provider_peer_deviation"] = prov_avg / overall_avg - 1.0 if overall_avg > 0 else 0.0
    else:
        features["provider_avg_charge_30d"] = 0.0
        features["provider_claim_volume_30d"] = 0.0
        features["provider_specialty_charge_percentile"] = 0.0
        features["provider_unique_patients_30d"] = 0.0
        features["provider_procedure_concentration"] = 0.0
        features["provider_peer_deviation"] = 0.0

    # === Member aggregate features (90-day lookback, strict <) ===
    lookback_90d = receipt_date - timedelta(days=90) if isinstance(receipt_date, date) else receipt_date

    member_history = lf.filter(
        (pl.col("member_id") == member_id)
        & (pl.col("claim_receipt_date") < receipt_date)  # STRICT < (constitution II)
        & (pl.col("claim_receipt_date") >= lookback_90d)
    ).collect()

    if len(member_history) > 0:
        features["member_claim_frequency_90d"] = float(len(member_history))
        features["member_unique_providers_90d"] = float(member_history["provider_id"].n_unique())
        features["member_avg_charge_90d"] = float(member_history["charge_amount"].mean())

        # Chronic condition count: approximate from unique diagnosis codes
        all_diags = set()
        for row in member_history.iter_rows(named=True):
            codes = row["diagnosis_codes"]
            if isinstance(codes, list):
                all_diags.update(codes)
        features["member_chronic_condition_count"] = float(len(all_diags))
    else:
        features["member_claim_frequency_90d"] = 0.0
        features["member_unique_providers_90d"] = 0.0
        features["member_avg_charge_90d"] = 0.0
        features["member_chronic_condition_count"] = 0.0

    # === Validate all manifest features are present ===
    required = _load_manifest()
    missing = [f for f in required if f not in features]
    if missing:
        raise FeatureComputationError(f"Missing features from manifest: {missing}")

    return features


def compute_features_batch(claims_df, target_claim_ids: list[str] | None = None) -> list[dict[str, float]]:
    """Compute features for multiple claims.

    Args:
        claims_df: DataFrame with all claims
        target_claim_ids: Claims to compute features for. If None, compute for all.

    Returns:
        List of feature dicts, one per target claim
    """
    if target_claim_ids is None:
        if hasattr(claims_df, "to_pandas"):
            target_claim_ids = claims_df["claim_id"].to_list()
        else:
            target_claim_ids = claims_df["claim_id"].tolist()

    results = []
    for claim_id in target_claim_ids:
        try:
            features = compute_features(claims_df, claim_id)
            features["claim_id"] = claim_id
            results.append(features)
        except FeatureComputationError as e:
            logger.warning("Skipping %s: %s", claim_id, e)
    return results

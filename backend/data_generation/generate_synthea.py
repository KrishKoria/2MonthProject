"""Generate synthetic Medicare Part B claims data (50K-100K records).

Instead of requiring Synthea (Java), this generates realistic synthetic claims
directly in Python using medical coding distributions.
"""

import argparse
import logging
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Realistic CPT codes for Medicare Part B professional claims
CPT_CODES = [
    "99213", "99214", "99215", "99203", "99204", "99205",  # E&M
    "27447", "27446", "27130", "27236",  # Orthopedic
    "43239", "43235", "45380", "45385",  # GI
    "93000", "93010", "93306", "93312",  # Cardiology
    "70553", "72148", "73721", "74177",  # Radiology
    "11102", "11104", "17000", "17003",  # Dermatology
    "64483", "64493", "20610", "20611",  # Pain management
    "76700", "76856", "76830", "76801",  # Ultrasound
    "90834", "90837", "90847", "96130",  # Behavioral health
    "36415", "80053", "85025", "87491",  # Lab
]

ICD10_CODES = [
    "M17.11", "M17.12", "M54.5", "M79.3",  # Musculoskeletal
    "I10", "I25.10", "I48.91", "I50.9",  # Cardiovascular
    "K21.0", "K57.30", "K80.20", "K92.1",  # GI
    "E11.9", "E78.5", "E03.9", "E66.01",  # Endocrine
    "J06.9", "J18.9", "J44.1", "J45.20",  # Respiratory
    "G89.29", "G43.909", "R51.9", "G47.33",  # Neurological
    "Z00.00", "Z12.11", "Z23", "Z87.891",  # Preventive
]

MODIFIERS = ["25", "26", "59", "76", "77", "LT", "RT", "TC", ""]

POS_CODES = ["11", "22", "23", "24", "31", "32", "41", "49", "51", "52", "53", "61", "65", "71", "72", "81"]

STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI",
          "NJ", "VA", "WA", "AZ", "MA", "TN", "IN", "MO", "MD", "WI"]

SPECIALTIES = [
    "Internal Medicine", "Family Medicine", "Cardiology", "Orthopedic Surgery",
    "General Surgery", "Dermatology", "Gastroenterology", "Neurology",
    "Radiology", "Psychiatry", "Emergency Medicine", "Anesthesiology",
    "Ophthalmology", "Urology", "Pulmonology", "Endocrinology",
    "Rheumatology", "Oncology", "Pain Management", "Physical Medicine",
]


def generate_providers(n_providers: int = 500, rng: np.random.Generator | None = None) -> pd.DataFrame:
    """Generate synthetic provider roster."""
    if rng is None:
        rng = np.random.default_rng(42)

    providers = []
    for i in range(n_providers):
        providers.append({
            "provider_id": f"PRV-{i + 1:04d}",
            "specialty": rng.choice(SPECIALTIES),
            "name": f"Dr. Provider-{i + 1}",
            "location_state": rng.choice(STATES),
        })
    return pd.DataFrame(providers)


def generate_members(n_members: int = 10000, rng: np.random.Generator | None = None) -> pd.DataFrame:
    """Generate synthetic member roster."""
    if rng is None:
        rng = np.random.default_rng(42)

    members = []
    for i in range(n_members):
        members.append({
            "member_id": f"MBR-{i + 1:06d}",
            "age": int(rng.normal(72, 8)),
            "state": rng.choice(STATES),
        })
    return pd.DataFrame(members)


def generate_claims(
    n_claims: int = 75000,
    providers: pd.DataFrame | None = None,
    members: pd.DataFrame | None = None,
    seed: int = 42,
) -> pd.DataFrame:
    """Generate synthetic Medicare Part B claims."""
    rng = np.random.default_rng(seed)

    if providers is None:
        providers = generate_providers(rng=rng)
    if members is None:
        members = generate_members(rng=rng)

    provider_ids = providers["provider_id"].values
    member_ids = members["member_id"].values

    logger.info("Generating %d synthetic claims...", n_claims)
    claims = []

    # Date range: 2 years of data
    start_date = date(2024, 1, 1)
    date_range_days = 730  # ~2 years

    for i in range(n_claims):
        # Random service date
        service_offset = int(rng.uniform(0, date_range_days))
        service_date = start_date + timedelta(days=service_offset)

        # Assign provider and member
        provider_id = rng.choice(provider_ids)
        member_id = rng.choice(member_ids)

        # Generate procedure codes (1-4 per claim)
        n_procs = int(rng.choice([1, 1, 1, 2, 2, 3, 4], p=[0.3, 0.2, 0.15, 0.15, 0.1, 0.05, 0.05]))
        proc_codes = list(rng.choice(CPT_CODES, size=n_procs, replace=False))

        # Generate diagnosis codes (1-3 per claim)
        n_diag = int(rng.choice([1, 1, 2, 2, 3], p=[0.3, 0.25, 0.2, 0.15, 0.1]))
        diag_codes = list(rng.choice(ICD10_CODES, size=n_diag, replace=False))

        # Generate modifiers
        n_mods = int(rng.choice([0, 0, 0, 1, 1, 2], p=[0.3, 0.25, 0.2, 0.15, 0.05, 0.05]))
        mods = [m for m in rng.choice(MODIFIERS, size=n_mods, replace=False) if m] if n_mods > 0 else []

        # Generate charges with lognormal distribution
        base_charge = float(np.exp(rng.normal(5.5, 1.2)))  # median ~$245
        charge_amount = round(max(25.0, base_charge), 2)
        allowed_amount = round(charge_amount * float(rng.uniform(0.4, 0.85)), 2)
        paid_amount = round(allowed_amount * float(rng.uniform(0.7, 1.0)), 2)

        pos = rng.choice(POS_CODES)

        claims.append({
            "claim_id": f"CLM-{service_date.year}-{i + 1:05d}",
            "member_id": member_id,
            "provider_id": provider_id,
            "service_date": service_date,
            "procedure_codes": proc_codes,
            "diagnosis_codes": diag_codes,
            "modifiers": mods,
            "charge_amount": charge_amount,
            "allowed_amount": allowed_amount,
            "paid_amount": paid_amount,
            "place_of_service": pos,
            "claim_status": "pending_review",
            "anomaly_type": None,
        })

    df = pd.DataFrame(claims)
    logger.info("Generated %d claims", len(df))
    return df, providers


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic claims data")
    parser.add_argument("--n-claims", type=int, default=75000, help="Number of claims")
    parser.add_argument("--output-dir", type=str, default="./data", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    processed_dir = output_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    claims_df, providers_df = generate_claims(n_claims=args.n_claims, seed=args.seed)

    # Save claims
    claims_path = processed_dir / "medical_claims.parquet"
    claims_df.to_parquet(claims_path, index=False)
    logger.info("Saved claims to %s", claims_path)

    # Save provider roster
    providers_path = processed_dir / "provider_roster.parquet"
    providers_df.to_parquet(providers_path, index=False)
    logger.info("Saved provider roster to %s", providers_path)

    logger.info("Done! Generated %d claims with %d providers", len(claims_df), len(providers_df))


if __name__ == "__main__":
    main()

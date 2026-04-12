"""Feature engineering tests — temporal integrity (constitution II)."""

from datetime import date

import pandas as pd
import pytest


def test_no_future_leakage():
    """Verify point-in-time feature engineering uses strict < inequality on claim_receipt_date.

    Constitution II: This test MUST be written and FAILING before any feature code.

    Test approach: Create claims with known receipt dates. Compute features for a target
    claim. Verify that NO data from claims received on or after the target's receipt date
    is used in the feature computation.
    """
    from app.ml.features import compute_features, FeatureComputationError

    # Create test claims with controlled dates
    claims_df = pd.DataFrame([
        {
            "claim_id": "CLM-2025-00001",
            "member_id": "MBR-000001",
            "provider_id": "PRV-0001",
            "service_date": date(2025, 1, 10),
            "claim_receipt_date": date(2025, 1, 15),  # received first
            "procedure_codes": ["99213"],
            "diagnosis_codes": ["M17.11"],
            "modifiers": [],
            "charge_amount": 150.0,
            "allowed_amount": 100.0,
            "paid_amount": 80.0,
            "place_of_service": "11",
            "claim_status": "pending_review",
            "anomaly_type": None,
        },
        {
            "claim_id": "CLM-2025-00002",  # TARGET CLAIM
            "member_id": "MBR-000001",
            "provider_id": "PRV-0001",
            "service_date": date(2025, 2, 1),
            "claim_receipt_date": date(2025, 2, 10),  # received second
            "procedure_codes": ["99214"],
            "diagnosis_codes": ["I10"],
            "modifiers": ["25"],
            "charge_amount": 200.0,
            "allowed_amount": 150.0,
            "paid_amount": 120.0,
            "place_of_service": "11",
            "claim_status": "pending_review",
            "anomaly_type": None,
        },
        {
            "claim_id": "CLM-2025-00003",
            "member_id": "MBR-000001",
            "provider_id": "PRV-0001",
            "service_date": date(2025, 2, 5),
            "claim_receipt_date": date(2025, 2, 10),  # same day as target — must NOT be included
            "procedure_codes": ["99215"],
            "diagnosis_codes": ["E11.9"],
            "modifiers": [],
            "charge_amount": 500.0,
            "allowed_amount": 400.0,
            "paid_amount": 350.0,
            "place_of_service": "11",
            "claim_status": "pending_review",
            "anomaly_type": None,
        },
        {
            "claim_id": "CLM-2025-00004",
            "member_id": "MBR-000001",
            "provider_id": "PRV-0001",
            "service_date": date(2025, 3, 1),
            "claim_receipt_date": date(2025, 3, 15),  # future — must NOT be included
            "procedure_codes": ["99213"],
            "diagnosis_codes": ["M54.5"],
            "modifiers": [],
            "charge_amount": 1000.0,
            "allowed_amount": 800.0,
            "paid_amount": 700.0,
            "place_of_service": "11",
            "claim_status": "pending_review",
            "anomaly_type": None,
        },
    ])

    # Compute features for the TARGET claim (CLM-2025-00002, receipt_date=2025-02-10)
    features = compute_features(claims_df, target_claim_id="CLM-2025-00002")

    # Provider avg charge 30d: only CLM-00001 (receipt 2025-01-15) should be included
    # CLM-00003 has same receipt date — strict < means excluded
    # CLM-00004 is future — excluded
    # So provider_avg_charge_30d should be based on CLM-00001 only = 150.0
    assert features["provider_avg_charge_30d"] == pytest.approx(150.0), (
        f"provider_avg_charge_30d should be 150.0 (only CLM-00001), got {features['provider_avg_charge_30d']}. "
        "Future or same-day claims leaked into aggregation!"
    )

    # Provider claim volume 30d: only CLM-00001 should count
    assert features["provider_claim_volume_30d"] == 1, (
        f"provider_claim_volume_30d should be 1, got {features['provider_claim_volume_30d']}. "
        "Future or same-day claims leaked!"
    )

    # Member claim frequency 90d: only CLM-00001 should count
    assert features["member_claim_frequency_90d"] == 1, (
        f"member_claim_frequency_90d should be 1, got {features['member_claim_frequency_90d']}. "
        "Future or same-day claims leaked!"
    )

    # Member avg charge 90d: only CLM-00001 should be included
    assert features["member_avg_charge_90d"] == pytest.approx(150.0), (
        f"member_avg_charge_90d should be 150.0, got {features['member_avg_charge_90d']}. "
        "Future or same-day claims leaked!"
    )


def test_place_of_service_encoding_is_deterministic():
    """POS encoding must be stable across processes. Python's built-in hash() is
    randomized per interpreter (PYTHONHASHSEED) and must never be used for persisted
    ML features — see constitution VI (output correctness / reproducibility)."""
    from app.ml.features import PLACE_OF_SERVICE_ENCODING

    # Known CMS POS codes have fixed ordinal encodings; unknown codes map to 0.
    assert PLACE_OF_SERVICE_ENCODING["11"] == 10  # Office
    assert PLACE_OF_SERVICE_ENCODING["21"] == 20  # Inpatient Hospital
    assert PLACE_OF_SERVICE_ENCODING["22"] == 21  # On-Campus Outpatient
    # Encoding table must not contain collisions (beyond the unknown-sentinel 0).
    values = list(PLACE_OF_SERVICE_ENCODING.values())
    assert len(values) == len(set(values)), "POS encoding has duplicate values"

"""Rules baseline tests for all deterministic flag types."""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from app.ml.rules_baseline import compute_rules_flags


def _make_claim(
    claim_id: str,
    *,
    provider_id: str,
    member_id: str,
    service_date: date,
    procedure_codes: list[str],
    charge_amount: float,
    place_of_service: str = "11",
) -> dict:
    return {
        "claim_id": claim_id,
        "provider_id": provider_id,
        "member_id": member_id,
        "service_date": service_date,
        "procedure_codes": procedure_codes,
        "charge_amount": charge_amount,
        "place_of_service": place_of_service,
    }


def test_compute_rules_flags_detects_ncci_outlier_and_duplicate(monkeypatch):
    def fake_lookup(self, code_1, code_2, service_date):
        if {code_1, code_2} == {"11111", "22222"}:
            return {"conflict_exists": True, "edit_type": "unbundling", "effective_date": "2024-01-01", "rationale": "test"}
        return {"conflict_exists": False, "edit_type": None, "effective_date": None, "rationale": None}

    monkeypatch.setattr("app.evidence.ncci_engine.NCCIEngine.lookup_ncci_conflict", fake_lookup)

    start = date(2026, 3, 1)
    claims = [
        _make_claim(
            "CLM-NCCI",
            provider_id="PRV-NCCI",
            member_id="MBR-NCCI",
            service_date=start,
            procedure_codes=["11111", "22222"],
            charge_amount=110.0,
        ),
        _make_claim(
            "CLM-DUP-1",
            provider_id="PRV-DUP",
            member_id="MBR-DUP",
            service_date=start + timedelta(days=1),
            procedure_codes=["33333"],
            charge_amount=105.0,
        ),
        _make_claim(
            "CLM-DUP-2",
            provider_id="PRV-DUP",
            member_id="MBR-DUP",
            service_date=start + timedelta(days=3),
            procedure_codes=["33333"],
            charge_amount=108.0,
        ),
    ]
    claims.extend(
        _make_claim(
            f"CLM-NORMAL-{idx}",
            provider_id=f"PRV-NORMAL-{idx}",
            member_id=f"MBR-NORMAL-{idx}",
            service_date=start + timedelta(days=idx + 5),
            procedure_codes=["44444"],
            charge_amount=100.0,
        )
        for idx in range(12)
    )
    claims.append(
        _make_claim(
            "CLM-OUTLIER",
            provider_id="PRV-OUTLIER",
            member_id="MBR-OUTLIER",
            service_date=start + timedelta(days=30),
            procedure_codes=["55555"],
            charge_amount=1200.0,
        )
    )

    result = compute_rules_flags(pd.DataFrame(claims))
    flags_by_claim = {
        row["claim_id"]: set(row["rules_flags"])
        for _, row in result.iterrows()
    }

    assert "ncci_conflict" in flags_by_claim["CLM-NCCI"]
    assert "duplicate_match" in flags_by_claim["CLM-DUP-1"]
    assert "duplicate_match" in flags_by_claim["CLM-DUP-2"]
    assert "charge_outlier" in flags_by_claim["CLM-OUTLIER"]


def test_compute_rules_flags_tolerates_ncci_engine_failures(monkeypatch):
    monkeypatch.setattr(
        "app.evidence.ncci_engine.NCCIEngine.lookup_ncci_conflict",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    claims_df = pd.DataFrame(
        [
            _make_claim(
                "CLM-FAILSAFE",
                provider_id="PRV-FAIL",
                member_id="MBR-FAIL",
                service_date=date(2026, 4, 1),
                procedure_codes=["11111", "22222"],
                charge_amount=100.0,
            )
        ]
    )

    result = compute_rules_flags(claims_df)

    assert result.iloc[0]["claim_id"] == "CLM-FAILSAFE"
    assert result.iloc[0]["rules_flags"] == []

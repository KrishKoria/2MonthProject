"""NCCI engine fixture tests for core edit categories and date boundaries."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from app.evidence.ncci_engine import NCCIEngine


def _write_fixture_csv(path: Path) -> Path:
    path.write_text(
        "\n".join(
            [
                "code_1,code_2,effective_date,deletion_date,modifier_indicator,edit_type",
                "27447,27446,2024-01-01,2025-12-31,0,unbundling",
                "19303,19304,2024-01-01,,1,bilateral",
                "12345,12346,2024-06-01,2025-06-01,9,assistant-at-surgery",
            ]
        ),
        encoding="utf-8",
    )
    return path


def test_lookup_ncci_conflict_finds_unbundling_regardless_of_code_order(tmp_path):
    engine = NCCIEngine(csv_path=_write_fixture_csv(tmp_path / "ncci.csv"))

    result = engine.lookup_ncci_conflict("27446", "27447", date(2024, 8, 15))

    assert result["conflict_exists"] is True
    assert result["edit_type"] == "unbundling"
    assert result["effective_date"] == "2024-01-01"
    assert "cannot be billed separately" in (result["rationale"] or "")


def test_lookup_ncci_conflict_handles_bilateral_category(tmp_path):
    engine = NCCIEngine(csv_path=_write_fixture_csv(tmp_path / "ncci.csv"))

    result = engine.lookup_ncci_conflict("19303", "19304", date(2024, 9, 1))

    assert result["conflict_exists"] is True
    assert result["edit_type"] == "bilateral"
    assert "bilateral" in (result["rationale"] or "").lower()


def test_lookup_ncci_conflict_handles_assistant_at_surgery_category(tmp_path):
    engine = NCCIEngine(csv_path=_write_fixture_csv(tmp_path / "ncci.csv"))

    result = engine.lookup_ncci_conflict("12345", "12346", date(2024, 9, 1))

    assert result["conflict_exists"] is True
    assert result["edit_type"] == "assistant-at-surgery"
    assert "assistant-at-surgery" in (result["rationale"] or "").lower()


def test_lookup_ncci_conflict_respects_effective_and_deletion_boundaries(tmp_path):
    engine = NCCIEngine(csv_path=_write_fixture_csv(tmp_path / "ncci.csv"))

    before_effective = engine.lookup_ncci_conflict("27447", "27446", date(2023, 12, 31))
    on_effective = engine.lookup_ncci_conflict("27447", "27446", date(2024, 1, 1))
    before_deletion = engine.lookup_ncci_conflict("27447", "27446", date(2025, 12, 30))
    on_deletion = engine.lookup_ncci_conflict("27447", "27446", date(2025, 12, 31))

    assert before_effective["conflict_exists"] is False
    assert on_effective["conflict_exists"] is True
    assert before_deletion["conflict_exists"] is True
    assert on_deletion["conflict_exists"] is False

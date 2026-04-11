"""NCCI conflict lookup engine — deterministic structured lookup (constitution I, IV).

Loads practitioner_ptp_edits.csv at startup. Exact-match on sorted code pair with date-range filtering.
"""

import logging
from datetime import date
from pathlib import Path

import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)


class NCCIEngine:
    """NCCI Procedure-to-Procedure edit lookup engine."""

    def __init__(self, csv_path: Path | None = None):
        self.csv_path = csv_path or (settings.ncci_dir / "practitioner_ptp_edits.csv")
        self._edits_df: pd.DataFrame | None = None

    @property
    def edits_df(self) -> pd.DataFrame:
        if self._edits_df is None:
            self._edits_df = self._load_edits()
        return self._edits_df

    def _load_edits(self) -> pd.DataFrame:
        """Load NCCI edits CSV."""
        if not self.csv_path.exists():
            logger.warning("NCCI CSV not found at %s, returning empty DataFrame", self.csv_path)
            return pd.DataFrame(columns=["code_1", "code_2", "effective_date", "deletion_date", "modifier_indicator"])

        df = pd.read_csv(self.csv_path, dtype=str)
        # Normalize: ensure code pairs are stored as sorted tuples
        df["effective_date"] = pd.to_datetime(df["effective_date"], errors="coerce").dt.date
        df["deletion_date"] = pd.to_datetime(df["deletion_date"], errors="coerce").dt.date

        logger.info("Loaded %d NCCI edits from %s", len(df), self.csv_path.name)
        return df

    def lookup_ncci_conflict(
        self, code_1: str, code_2: str, service_date: date | str
    ) -> dict:
        """Look up NCCI conflict for a code pair on a given service date.

        Args:
            code_1: First CPT code
            code_2: Second CPT code
            service_date: Date of service for date-range filtering

        Returns:
            dict with conflict_exists, edit_type, effective_date, rationale
        """
        if isinstance(service_date, str):
            service_date = date.fromisoformat(service_date)

        # Normalize code order (sorted tuple for consistent lookup)
        sorted_pair = tuple(sorted([code_1, code_2]))

        if self.edits_df.empty:
            return {
                "conflict_exists": False,
                "edit_type": None,
                "effective_date": None,
                "rationale": None,
            }

        # Exact match on sorted pair
        mask = (
            (
                ((self.edits_df["code_1"] == sorted_pair[0]) & (self.edits_df["code_2"] == sorted_pair[1]))
                | ((self.edits_df["code_1"] == sorted_pair[1]) & (self.edits_df["code_2"] == sorted_pair[0]))
            )
            & (self.edits_df["effective_date"] <= service_date)
            & (self.edits_df["deletion_date"].isna() | (self.edits_df["deletion_date"] > service_date))
        )

        matches = self.edits_df[mask]
        if matches.empty:
            return {
                "conflict_exists": False,
                "edit_type": None,
                "effective_date": None,
                "rationale": None,
            }

        row = matches.iloc[0]
        return {
            "conflict_exists": True,
            "edit_type": row.get("edit_type", "unbundling"),
            "effective_date": str(row["effective_date"]) if pd.notna(row["effective_date"]) else None,
            "rationale": f"CPT {sorted_pair[1]} is a component of {sorted_pair[0]} and cannot be billed separately.",
        }

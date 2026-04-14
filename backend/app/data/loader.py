"""Parquet data loader — loads all data at FastAPI startup (constitution IV)."""

import os
import json
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock

import pandas as pd
import pyarrow.parquet as pq

from app.config import settings
from app.data.schemas import ClaimRecord, ClaimStatus, Investigation, RiskScore

logger = logging.getLogger(__name__)


@dataclass
class DataStore:
    """In-memory data store loaded from Parquet files at startup."""

    claims_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    risk_scores_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    provider_roster_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    anomaly_labels_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    ncci_edits_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    model_metadata: dict = field(default_factory=dict)
    investigations: dict[str, Investigation] = field(default_factory=dict)
    _claims_lock: RLock = field(default_factory=RLock, init=False, repr=False)
    _investigations_lock: RLock = field(default_factory=RLock, init=False, repr=False)

    def get_claim(self, claim_id: str) -> dict | None:
        """Get a single claim by ID."""
        mask = self.claims_df["claim_id"] == claim_id
        rows = self.claims_df[mask]
        if rows.empty:
            return None
        row = rows.iloc[0]
        return row.to_dict()

    def get_risk_score(self, claim_id: str) -> dict | None:
        """Get risk score for a claim."""
        mask = self.risk_scores_df["claim_id"] == claim_id
        rows = self.risk_scores_df[mask]
        if rows.empty:
            return None
        row = rows.iloc[0]
        return row.to_dict()

    def update_claim_status(self, claim_id: str, new_status: str) -> None:
        """Update claim status with state machine validation."""
        with self._claims_lock:
            mask = self.claims_df["claim_id"] == claim_id
            if not mask.any():
                raise ValueError(f"Claim {claim_id} not found")

            current_status = self.claims_df.loc[mask, "claim_status"].iloc[0]
            _validate_status_transition(current_status, new_status)
            self.claims_df.loc[mask, "claim_status"] = new_status

    def save_investigation(self, investigation: Investigation) -> None:
        """Persist investigation to in-memory store and write to Parquet."""
        with self._investigations_lock:
            self.investigations[investigation.claim_id] = investigation
            self._persist_investigations()

    def _persist_investigations(self) -> None:
        """Serialize investigations to Parquet for restart survival."""
        if not self.investigations:
            return
        records = []
        for inv in self.investigations.values():
            records.append(inv.model_dump(mode="json"))

        df = pd.DataFrame(records)
        output_path = settings.scores_dir / "investigations.parquet"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
        df.to_parquet(temp_path, index=False)
        os.replace(temp_path, output_path)
        logger.info("Persisted %d investigations to %s", len(records), output_path)


def _validate_status_transition(current: str, new: str) -> None:
    """Validate claim status state machine transitions."""
    allowed_transitions: dict[str, set[str]] = {
        ClaimStatus.PENDING_REVIEW: {
            ClaimStatus.ACCEPTED,
            ClaimStatus.REJECTED,
            ClaimStatus.ESCALATED,
            ClaimStatus.MANUAL_REVIEW_REQUIRED,
        },
    }
    allowed = allowed_transitions.get(current, set())
    if new not in allowed:
        raise ValueError(
            f"Invalid status transition: {current} -> {new}. "
            f"Allowed from {current}: {allowed or 'none (terminal state)'}"
        )


def _load_parquet_safe(path: Path) -> pd.DataFrame:
    """Load a Parquet file if it exists, else return empty DataFrame."""
    if path.exists():
        df = pd.read_parquet(path)
        logger.info("Loaded %d rows from %s", len(df), path.name)
        return df
    logger.warning("Parquet file not found: %s", path)
    return pd.DataFrame()


def _load_csv_safe(path: Path) -> pd.DataFrame:
    """Load a CSV file if it exists, else return empty DataFrame."""
    if path.exists():
        df = pd.read_csv(path)
        logger.info("Loaded %d rows from %s", len(df), path.name)
        return df
    logger.warning("CSV file not found: %s", path)
    return pd.DataFrame()


def _normalize_parquet_scalar(value):
    try:
        if pd.isna(value):
            return None
    except TypeError:
        return value
    return value


def _load_investigations(path: Path) -> dict[str, Investigation]:
    """Load persisted investigations from Parquet."""
    if not path.exists():
        return {}
    df = pd.read_parquet(path)
    investigations = {}
    for _, row in df.iterrows():
        record = {
            key: _normalize_parquet_scalar(value)
            for key, value in row.to_dict().items()
        }
        inv = Investigation.model_validate(record)
        investigations[inv.claim_id] = inv
    logger.info("Loaded %d investigations from %s", len(investigations), path.name)
    return investigations


def load_data_store() -> DataStore:
    """Load all data files into the in-memory DataStore."""
    store = DataStore()

    # Load Parquet files
    store.claims_df = _load_parquet_safe(settings.processed_dir / "medical_claims.parquet")
    store.risk_scores_df = _load_parquet_safe(settings.scores_dir / "risk_scores.parquet")
    store.provider_roster_df = _load_parquet_safe(settings.processed_dir / "provider_roster.parquet")
    store.anomaly_labels_df = _load_parquet_safe(settings.processed_dir / "anomaly_labels.parquet")

    # Load NCCI CSV
    store.ncci_edits_df = _load_csv_safe(settings.ncci_dir / "practitioner_ptp_edits.csv")

    # Load model metadata
    metadata_path = settings.scores_dir / "model_metadata.json"
    if metadata_path.exists():
        with open(metadata_path) as f:
            store.model_metadata = json.load(f)
        logger.info("Loaded model metadata from %s", metadata_path.name)

    # Load persisted investigations
    store.investigations = _load_investigations(settings.scores_dir / "investigations.parquet")

    return store


@asynccontextmanager
async def lifespan(app: object) -> AsyncGenerator[dict, None]:
    """FastAPI lifespan: load all Parquet data at startup."""
    logger.info("Loading data store...")
    store = load_data_store()
    openai_client = None
    if settings.OPENAI_API_KEY:
        from openai import AsyncOpenAI

        openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    logger.info("Data store ready.")
    yield {"data_store": store, "openai_client": openai_client}
    logger.info("Shutting down data store.")

"""DataStore persistence tests."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from threading import Event
from uuid import uuid4

import pandas as pd
import pytest

from app.config import settings
from app.data.loader import DataStore, load_data_store
from app.data.schemas import Investigation, InvestigationStatus


def _workspace_data_dir(prefix: str) -> Path:
    return Path(__file__).resolve().parent / "_tmp" / f"{prefix}-{uuid4().hex}"


def _investigation(claim_id: str) -> Investigation:
    now = datetime.now(timezone.utc)
    return Investigation(
        claim_id=claim_id,
        investigation_status=InvestigationStatus.COMPLETE,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_save_investigation_serializes_overlapping_writes(monkeypatch):
    data_dir = _workspace_data_dir("loader")
    monkeypatch.setattr(settings, "DATA_DIR", data_dir)

    store = DataStore()
    original_to_parquet = pd.DataFrame.to_parquet
    first_write_started = Event()
    allow_first_write = Event()

    def _patched_to_parquet(self, path, *args, **kwargs):
        claim_ids = set(self["claim_id"].tolist())
        if claim_ids == {"CLM-1001"} and not first_write_started.is_set():
            first_write_started.set()
            assert allow_first_write.wait(timeout=2), "timed out waiting to release first write"
        return original_to_parquet(self, path, *args, **kwargs)

    monkeypatch.setattr(pd.DataFrame, "to_parquet", _patched_to_parquet)

    first = asyncio.create_task(asyncio.to_thread(store.save_investigation, _investigation("CLM-1001")))
    await asyncio.to_thread(first_write_started.wait, 2)

    second = asyncio.create_task(asyncio.to_thread(store.save_investigation, _investigation("CLM-1002")))
    await asyncio.sleep(0.05)
    assert not second.done()
    allow_first_write.set()
    await asyncio.gather(first, second)

    reloaded = load_data_store()
    assert set(reloaded.investigations) == {"CLM-1001", "CLM-1002"}

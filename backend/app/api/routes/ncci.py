"""Direct NCCI conflict lookup route (T049)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_data_store
from app.data.loader import DataStore
from app.evidence.ncci_engine import NCCIEngine

router = APIRouter(prefix="/api/ncci", tags=["ncci"])

_engine: NCCIEngine | None = None


def _get_engine() -> NCCIEngine:
    global _engine
    if _engine is None:
        _engine = NCCIEngine()
    return _engine


def _envelope(data: Any) -> dict:
    return {
        "data": data,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data_source": "synthetic",
        },
    }


@router.get("/{code_1}/{code_2}")
async def lookup(
    code_1: str,
    code_2: str,
    store: Annotated[DataStore, Depends(get_data_store)],
    service_date: date = Query(..., description="ISO-8601 date for edit-date filtering"),
) -> dict:
    result = _get_engine().lookup_ncci_conflict(code_1, code_2, service_date)
    return _envelope({
        "code_1": code_1,
        "code_2": code_2,
        "service_date": service_date.isoformat(),
        **result,
    })

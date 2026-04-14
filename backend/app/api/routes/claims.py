"""Claims list and detail API routes."""

from datetime import date, datetime, timezone
from typing import Annotated, Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_data_store
from app.data.loader import DataStore
from app.utils.collections import ensure_list

router = APIRouter(prefix="/api/claims", tags=["claims"])

_SORT_COLUMNS = {
    "risk_score": "xgboost_score",
    "service_date": "service_date",
    "claim_receipt_date": "claim_receipt_date",
    "charge_amount": "charge_amount",
}


def _envelope(data: Any) -> dict:
    return {
        "data": data,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data_source": "synthetic",
        },
    }


def _normalize_score(score: dict | None) -> dict | None:
    if score is None:
        return None
    scored_at = score.get("scored_at")
    return {
        "claim_id": score.get("claim_id"),
        "xgboost_score": float(score.get("xgboost_score", 0) or 0),
        "shap_values": dict(score.get("shap_values") or {}),
        "rules_flags": ensure_list(score.get("rules_flags")),
        "risk_band": score.get("risk_band"),
        "scored_at": scored_at.isoformat() if isinstance(scored_at, datetime) else scored_at,
    }


def _merge_claim_with_score(claim: dict, score: dict | None) -> dict:
    normalized_score = _normalize_score(score)
    out = {
        "claim_id": claim["claim_id"],
        "member_id": claim["member_id"],
        "provider_id": claim["provider_id"],
        "service_date": claim["service_date"].isoformat() if isinstance(claim["service_date"], date) else claim["service_date"],
        "claim_receipt_date": claim["claim_receipt_date"].isoformat() if isinstance(claim["claim_receipt_date"], date) else claim["claim_receipt_date"],
        "procedure_codes": ensure_list(claim.get("procedure_codes")),
        "diagnosis_codes": ensure_list(claim.get("diagnosis_codes")),
        "modifiers": ensure_list(claim.get("modifiers")),
        "charge_amount": float(claim["charge_amount"]),
        "allowed_amount": float(claim["allowed_amount"]),
        "paid_amount": float(claim["paid_amount"]),
        "place_of_service": claim["place_of_service"],
        "claim_status": claim["claim_status"],
        "anomaly_type": claim.get("anomaly_type"),
    }
    if normalized_score is not None:
        out["risk_score"] = normalized_score["xgboost_score"]
        out["risk_band"] = normalized_score["risk_band"]
        out["rules_flags"] = normalized_score["rules_flags"]
        out["shap_values"] = normalized_score["shap_values"]
    else:
        out["risk_score"] = None
        out["risk_band"] = None
        out["rules_flags"] = []
        out["shap_values"] = {}
    return out


def _list_claims_payload(
    store: DataStore,
    *,
    status: str | None,
    risk_band: str | None,
    anomaly_type: str | None,
    provider_id: str | None,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> dict:
    if sort_by not in _SORT_COLUMNS:
        raise ValueError(f"Unsupported sort_by: {sort_by}")
    if sort_dir not in {"asc", "desc"}:
        raise ValueError(f"Unsupported sort_dir: {sort_dir}")

    claims_df = store.claims_df
    if claims_df.empty:
        return {"claims": [], "total": 0, "page": page, "page_size": page_size}

    df = claims_df.copy()

    if status:
        df = df[df["claim_status"] == status]
    if anomaly_type:
        df = df[df["anomaly_type"] == anomaly_type]
    if provider_id:
        df = df[df["provider_id"] == provider_id]
    if date_from:
        df = df[df["service_date"] >= date_from]
    if date_to:
        df = df[df["service_date"] <= date_to]

    scores_df = store.risk_scores_df
    if not scores_df.empty:
        merged = df.merge(
            scores_df[["claim_id", "xgboost_score", "risk_band", "rules_flags", "shap_values"]],
            on="claim_id",
            how="left",
        )
    else:
        merged = df.assign(xgboost_score=None, risk_band=None, rules_flags=None, shap_values=None)

    if risk_band:
        merged = merged[merged["risk_band"] == risk_band]

    ascending = sort_dir == "asc"
    sort_col = _SORT_COLUMNS[sort_by]
    merged = merged.sort_values(sort_col, ascending=ascending, na_position="last")

    total = len(merged)
    start = (page - 1) * page_size
    end = start + page_size
    page_df = merged.iloc[start:end]

    claims = []
    for _, row in page_df.iterrows():
        claim = row.to_dict()
        score = None
        if pd.notna(row.get("xgboost_score")):
            score = {
                "xgboost_score": row["xgboost_score"],
                "risk_band": row["risk_band"],
                "rules_flags": row.get("rules_flags"),
                "shap_values": row.get("shap_values"),
            }
        claims.append(_merge_claim_with_score(claim, score))

    return {
        "claims": claims,
        "total": int(total),
        "page": page,
        "page_size": page_size,
    }


@router.get("")
async def list_claims(
    store: Annotated[DataStore, Depends(get_data_store)],
    status: str | None = None,
    risk_band: str | None = None,
    anomaly_type: str | None = None,
    provider_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort_by: str = "risk_score",
    sort_dir: str = "desc",
) -> dict:
    payload = await run_in_threadpool(
        _list_claims_payload,
        store,
        status=status,
        risk_band=risk_band,
        anomaly_type=anomaly_type,
        provider_id=provider_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return _envelope(payload)


@router.get("/{claim_id}")
async def get_claim(
    claim_id: str,
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    claim = store.get_claim(claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
    score = store.get_risk_score(claim_id)
    investigation = store.investigations.get(claim_id)
    return _envelope({
        "claim": _merge_claim_with_score(claim, score),
        "risk_score": _normalize_score(score),
        "investigation": investigation.model_dump(mode="json") if investigation else None,
    })

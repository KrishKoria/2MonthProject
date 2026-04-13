"""Analytics API routes."""

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.dependencies import get_data_store
from app.data.loader import DataStore

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _envelope(data: Any) -> dict:
    return {
        "data": data,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data_source": "synthetic",
        },
    }


@router.get("/overview")
async def overview(
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    claims_df = store.claims_df
    scores_df = store.risk_scores_df
    total_claims = int(len(claims_df))

    if scores_df.empty:
        return _envelope({
            "total_claims": total_claims,
            "flagged_count": 0,
            "high_risk_count": 0,
            "investigation_rate": 0.0,
            "avg_risk_score": 0.0,
            "anomaly_distribution": {"upcoding": 0, "ncci_violation": 0, "duplicate": 0},
            "rules_baseline_flagged": 0,
            "ml_only_flagged": 0,
            "combined_flagged": 0,
        })

    high_risk_mask = scores_df["risk_band"] == "high"
    high_risk_count = int(high_risk_mask.sum())

    rules_flagged_mask = scores_df["rules_flags"].apply(lambda f: bool(f) and len(f) > 0)
    ml_flagged_mask = high_risk_mask
    combined_mask = rules_flagged_mask | ml_flagged_mask
    flagged_count = int(combined_mask.sum())

    avg_risk_score = float(scores_df["xgboost_score"].mean()) if len(scores_df) else 0.0

    dist = {"upcoding": 0, "ncci_violation": 0, "duplicate": 0}
    if "anomaly_type" in claims_df.columns:
        counts = claims_df["anomaly_type"].dropna().value_counts().to_dict()
        for k in dist:
            dist[k] = int(counts.get(k, 0))

    investigations = store.investigations
    inv_rate = float(len(investigations)) / total_claims if total_claims else 0.0

    return _envelope({
        "total_claims": total_claims,
        "flagged_count": flagged_count,
        "high_risk_count": high_risk_count,
        "investigation_rate": inv_rate,
        "avg_risk_score": round(avg_risk_score, 2),
        "anomaly_distribution": dist,
        "rules_baseline_flagged": int(rules_flagged_mask.sum()),
        "ml_only_flagged": int((ml_flagged_mask & ~rules_flagged_mask).sum()),
        "combined_flagged": int(combined_mask.sum()),
    })


@router.get("/model-performance")
async def model_performance(
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    """Return model evaluation metrics for US4 — all synthetic-data framed."""
    meta = store.model_metadata or {}
    if not meta:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail="Model metadata unavailable — run backend/scripts/train_model.py",
        )

    return _envelope({
        "auc_roc": float(meta.get("auc_roc", 0.0)),
        "precision_at_k": meta.get("precision_at_k") or {},
        "precision_recall_curve": meta.get("precision_recall_curve") or [],
        "per_anomaly_recall": meta.get("per_anomaly_recall") or {},
        "ablation": meta.get("ablation") or {},
        "data_framing": "synthetic",
    })

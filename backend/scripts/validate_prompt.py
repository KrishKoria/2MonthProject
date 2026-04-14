"""Validate rationale prompt outputs against schema and usefulness gates.

This script is a manual pre-demo evaluation gate. It is intentionally not part
of the automated pytest suite because it requires a real OpenAI key, a populated
Chroma store, and live model responses.

T075:
  - Sample 50 representative flagged claims
  - Run real triage + evidence + rationale with the configured LLM/Chroma store
  - Assert schema correctness, non-empty citations, anomaly flag coverage, and action
  - Gate: >= 90% pass

T075a:
  - Score each rationale using the rubric in specs/.../rubric.md
  - Write evaluation output to data/scores/rationale_eval_results.json
  - Gate: >= 85% rated useful
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

# Allow running as a script from backend/scripts/.
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.data.loader import DataStore, load_data_store
from app.data.schemas import RationaleResult
from app.orchestrator.evidence import run_evidence
from app.orchestrator.rationale import run_rationale
from app.orchestrator.triage import run_triage
from app.utils.collections import ensure_list, has_items

REQUIRED_FLAG_KEYS = {"upcoding", "ncci_violation", "duplicate"}
VALIDATION_OUTPUT_PATH = settings.scores_dir / "rationale_validation_results.json"
QUALITY_OUTPUT_PATH = settings.scores_dir / "rationale_eval_results.json"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_flagged(score_row: pd.Series) -> bool:
    return (
        float(score_row.get("xgboost_score") or 0.0) >= settings.RISK_THRESHOLD
        or str(score_row.get("risk_band") or "").lower() == "high"
        or has_items(score_row.get("rules_flags"))
    )


def select_representative_claim_ids(
    claims_df: pd.DataFrame,
    risk_scores_df: pd.DataFrame,
    *,
    limit: int = 50,
) -> list[str]:
    """Select the highest-priority flagged claims from the queue."""
    merged = claims_df[["claim_id", "anomaly_type"]].merge(
        risk_scores_df[["claim_id", "xgboost_score", "risk_band", "rules_flags"]],
        on="claim_id",
        how="inner",
    )
    if merged.empty:
        return []

    flagged = merged[merged.apply(_is_flagged, axis=1)].copy()
    if flagged.empty:
        return []

    flagged = flagged.sort_values("xgboost_score", ascending=False)
    return flagged["claim_id"].head(limit).tolist()


def validate_rationale_payload(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate a rationale payload against schema and business gates."""
    reasons: list[str] = []

    flags = payload.get("anomaly_flags_addressed")
    if not isinstance(flags, dict) or not REQUIRED_FLAG_KEYS.issubset(flags.keys()):
        reasons.append("missing_anomaly_flag_keys")

    if not ensure_list(payload.get("policy_citations")):
        reasons.append("policy_citations_empty")

    if not str(payload.get("recommended_action") or "").strip():
        reasons.append("recommended_action_empty")

    try:
        RationaleResult.model_validate(payload)
    except Exception:
        reasons.append("schema_validation_failed")

    return len(reasons) == 0, reasons


def score_rationale_usefulness(
    payload: dict[str, Any],
    *,
    expected_anomaly_type: str | None,
    retrieved_citations: list[dict[str, Any]],
) -> str:
    """Apply the Phase 7 rationale-quality rubric."""
    predicted = payload.get("anomaly_type")
    citation_list = ensure_list(payload.get("policy_citations"))
    allowed_sources = {
        citation.get("source")
        for citation in retrieved_citations
        if isinstance(citation, dict)
    }
    citation_sources = {
        citation.get("source")
        for citation in citation_list
        if isinstance(citation, dict)
    }

    correct_anomaly = expected_anomaly_type is None or predicted == expected_anomaly_type
    actionable = bool(str(payload.get("recommended_action") or "").strip())
    has_valid_citations = bool(citation_sources) and citation_sources.issubset(allowed_sources)

    if not correct_anomaly or (citation_sources and not has_valid_citations):
        return "not_useful"
    if correct_anomaly and has_valid_citations and actionable:
        return "useful"
    return "partially_useful"


def _initial_state(store: DataStore, claim_id: str) -> dict[str, Any]:
    claim = store.get_claim(claim_id)
    if claim is None:
        raise ValueError(f"Claim {claim_id} not found")
    score = store.get_risk_score(claim_id) or {}
    return {
        "claim_id": claim_id,
        "claim_data": claim,
        "xgboost_risk_score": float(score.get("xgboost_score") or 0.0),
        "shap_values": dict(score.get("shap_values") or {}),
        "rules_flags": ensure_list(score.get("rules_flags")),
        "anomaly_flags": {},
        "evidence_tools_to_use": [],
        "investigation_status": "pending",
    }


async def _evaluate_claim(store: DataStore, claim_id: str) -> dict[str, Any]:
    state = _initial_state(store, claim_id)
    claim = state["claim_data"]

    state.update(run_triage(state))
    triage_anomaly = state.get("anomaly_type")
    state.update(run_evidence(state, store))

    evidence_results = state.get("evidence_results") or {}
    record: dict[str, Any] = {
        "claim_id": claim_id,
        "expected_anomaly_type": claim.get("anomaly_type"),
        "triage_anomaly_type": triage_anomaly,
        "investigation_status": state.get("investigation_status"),
        "validation_passed": False,
        "validation_reasons": [],
        "quality_rating": "not_useful",
        "policy_citation_count": len(ensure_list(evidence_results.get("policy_citations"))),
    }

    if state.get("investigation_status") != "evidence_complete":
        record["validation_reasons"] = ["manual_review_required"]
        return record

    rationale_result = await run_rationale(state)
    if rationale_result.get("investigation_status") != "complete":
        record["validation_reasons"] = [str(rationale_result.get("error_message") or "rationale_failed")]
        return record

    payload = dict(rationale_result["rationale"])
    payload["anomaly_type"] = triage_anomaly
    validation_passed, reasons = validate_rationale_payload(payload)
    quality_rating = score_rationale_usefulness(
        payload,
        expected_anomaly_type=claim.get("anomaly_type"),
        retrieved_citations=ensure_list(evidence_results.get("policy_citations")),
    )

    record.update(
        {
            "investigation_status": "complete",
            "validation_passed": validation_passed,
            "validation_reasons": reasons,
            "quality_rating": quality_rating,
            "recommended_action": payload.get("recommended_action"),
            "policy_citation_count": len(ensure_list(payload.get("policy_citations"))),
            "summary": payload.get("summary"),
            "rationale": payload,
        }
    )
    return record


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


async def _run(limit: int) -> int:
    store = load_data_store()
    claim_ids = select_representative_claim_ids(store.claims_df, store.risk_scores_df, limit=limit)
    if not claim_ids:
        raise RuntimeError("No representative flagged claims available for validation")

    records = []
    for index, claim_id in enumerate(claim_ids, start=1):
        print(f"[{index}/{len(claim_ids)}] validating {claim_id}")
        records.append(await _evaluate_claim(store, claim_id))

    validation_passes = sum(1 for record in records if record["validation_passed"])
    useful_count = sum(1 for record in records if record["quality_rating"] == "useful")
    ratings = Counter(record["quality_rating"] for record in records)

    validation_summary = {
        "evaluated_at": _iso_now(),
        "sample_size": len(records),
        "pass_count": validation_passes,
        "pass_rate": round(validation_passes / len(records), 4),
        "records": records,
    }
    quality_summary = {
        "evaluated_at": _iso_now(),
        "sample_size": len(records),
        "ratings": dict(ratings),
        "useful_count": useful_count,
        "useful_rate": round(useful_count / len(records), 4),
        "records": [
            {
                "claim_id": record["claim_id"],
                "expected_anomaly_type": record["expected_anomaly_type"],
                "triage_anomaly_type": record["triage_anomaly_type"],
                "quality_rating": record["quality_rating"],
                "validation_passed": record["validation_passed"],
            }
            for record in records
        ],
    }

    _write_json(VALIDATION_OUTPUT_PATH, validation_summary)
    _write_json(QUALITY_OUTPUT_PATH, quality_summary)

    print(
        "validation:",
        f"{validation_passes}/{len(records)}",
        f"({validation_summary['pass_rate']:.1%})",
        "| useful:",
        f"{useful_count}/{len(records)}",
        f"({quality_summary['useful_rate']:.1%})",
    )

    exit_code = 0
    if validation_summary["pass_rate"] < 0.90:
        print("schema gate failed: pass_rate < 90%")
        exit_code = 1
    if quality_summary["useful_rate"] < 0.85:
        print("quality gate failed: useful_rate < 85%")
        exit_code = 1
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50, help="Number of flagged claims to validate")
    args = parser.parse_args()
    return asyncio.run(_run(limit=args.limit))


if __name__ == "__main__":
    raise SystemExit(main())

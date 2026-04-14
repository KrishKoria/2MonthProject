"""Deterministic triage node (constitution I, VII).

Classifies the primary anomaly type, evaluates all 3 anomaly flags with explicit
`detected | not_applicable | insufficient_data` values, records the four-source
evidence plan, and sets priority. No I/O, no LLM — must complete in <100ms.
"""

from __future__ import annotations

import logging
import time

from app.config import settings
from app.utils.collections import ensure_list

logger = logging.getLogger(__name__)

TOOLS_FOR_ANOMALY: dict[str, list[str]] = {
    "upcoding": ["rag_retrieval", "provider_history"],
    "ncci_violation": ["ncci_lookup", "rag_retrieval"],
    "duplicate": ["duplicate_search", "provider_history"],
}

_TOOL_ORDER = ("ncci_lookup", "rag_retrieval", "provider_history", "duplicate_search")


def run_triage(state: dict) -> dict:
    """Deterministic triage — returns a partial state update."""
    start = time.perf_counter()
    claim = state.get("claim_data") or {}
    rules_flags = ensure_list(state.get("rules_flags"))
    score = float(state.get("xgboost_risk_score") or 0.0)

    proc_codes = ensure_list(claim.get("procedure_codes"))
    n_codes = len(proc_codes)
    member_id = claim.get("member_id")
    service_date = claim.get("service_date")

    flags: dict[str, str] = {}

    # Upcoding — always applicable; detected if charge_outlier flag or high-risk score
    if "charge_outlier" in rules_flags or score >= settings.HIGH_RISK_THRESHOLD:
        flags["upcoding"] = "detected"
    else:
        flags["upcoding"] = "insufficient_data"

    # NCCI — not applicable without ≥2 procedure codes
    if "ncci_conflict" in rules_flags:
        flags["ncci_violation"] = "detected"
    elif n_codes < 2:
        flags["ncci_violation"] = "not_applicable"
    else:
        flags["ncci_violation"] = "insufficient_data"

    # Duplicate — cheap detection via precomputed rules flag; otherwise unknown
    if "duplicate_match" in rules_flags:
        flags["duplicate"] = "detected"
    elif not member_id or service_date is None:
        flags["duplicate"] = "not_applicable"
    else:
        flags["duplicate"] = "insufficient_data"

    # Primary anomaly — priority order: NCCI > upcoding > duplicate
    primary: str | None = None
    for anomaly in ("ncci_violation", "upcoding", "duplicate"):
        if flags[anomaly] == "detected":
            primary = anomaly
            break

    # Evidence node always attempts all four deterministic sources. Keep the
    # triage payload aligned with that runtime behavior so downstream consumers
    # do not interpret this field as a narrower selection.
    evidence_tools_to_use = list(_TOOL_ORDER)

    # Priority — high at/over HIGH_RISK_THRESHOLD or any detected flag with score ≥ med;
    # otherwise medium above MEDIUM_RISK_THRESHOLD, else low.
    detected_any = any(v == "detected" for v in flags.values())
    if score >= settings.HIGH_RISK_THRESHOLD:
        priority = "high"
    elif detected_any and score >= settings.RISK_THRESHOLD:
        priority = "high"
    elif score >= settings.RISK_THRESHOLD or detected_any:
        priority = "medium"
    else:
        priority = "low"

    detected_count = sum(1 for v in flags.values() if v == "detected")
    confidence = round(min(1.0, (score / 100.0) + 0.15 * detected_count), 3)

    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "Triage: claim=%s primary=%s priority=%s tools=%s elapsed=%.1fms",
        state.get("claim_id"), primary, priority, evidence_tools_to_use, elapsed_ms,
    )

    return {
        "anomaly_type": primary,
        "anomaly_flags": flags,
        "confidence": confidence,
        "priority": priority,
        "evidence_tools_to_use": evidence_tools_to_use,
        "investigation_status": "triage_complete",
    }

"""Deterministic triage node (constitution I, VII).

Classifies the primary anomaly type, evaluates all 3 anomaly flags with explicit
`detected | not_applicable | insufficient_data` values, selects evidence tools,
and sets priority. No I/O, no LLM — must complete in <100ms.
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

HIGH_RISK_THRESHOLD = 70.0
MEDIUM_RISK_THRESHOLD = 40.0

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
    rules_flags = list(state.get("rules_flags") or [])
    score = float(state.get("xgboost_risk_score") or 0.0)

    proc_codes = claim.get("procedure_codes") or []
    n_codes = len(proc_codes) if isinstance(proc_codes, (list, tuple)) else 0

    flags: dict[str, str] = {}

    # Upcoding — always applicable; detected if charge_outlier flag or high-risk score
    if "charge_outlier" in rules_flags or score >= HIGH_RISK_THRESHOLD:
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
    else:
        flags["duplicate"] = "insufficient_data"

    # Primary anomaly — priority order: NCCI > upcoding > duplicate
    primary: str | None = None
    for anomaly in ("ncci_violation", "upcoding", "duplicate"):
        if flags[anomaly] == "detected":
            primary = anomaly
            break

    # Evidence tools — union across detected flags; always include rag_retrieval;
    # when nothing detected, cast a wide net so evidence node can still produce context.
    tools_set: set[str] = set()
    for anomaly, status in flags.items():
        if status == "detected":
            tools_set.update(TOOLS_FOR_ANOMALY.get(anomaly, []))
    tools_set.add("rag_retrieval")
    if primary is None:
        tools_set.update(("provider_history", "duplicate_search"))
    evidence_tools_to_use = [t for t in _TOOL_ORDER if t in tools_set]

    # Priority — high at/over HIGH_RISK_THRESHOLD or any detected flag with score ≥ med;
    # otherwise medium above MEDIUM_RISK_THRESHOLD, else low.
    detected_any = any(v == "detected" for v in flags.values())
    if score >= HIGH_RISK_THRESHOLD:
        priority = "high"
    elif detected_any and score >= MEDIUM_RISK_THRESHOLD:
        priority = "high"
    elif score >= MEDIUM_RISK_THRESHOLD or detected_any:
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

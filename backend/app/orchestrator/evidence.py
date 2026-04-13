"""Deterministic evidence node (constitution I, III, VII).

Attempts all 4 evidence sources regardless of which the triage node selected,
so `sources_consulted` always contains 4 entries. Unavailable sources are
explicit. If every source is unavailable, returns `manual_review_required` to
halt the pipeline (evidence-gated synthesis, constitution III).
"""

from __future__ import annotations

import logging
import time

from app.data.loader import DataStore
from app.data.schemas import EvidenceEnvelope, SourceRecord
from app.orchestrator import tools

logger = logging.getLogger(__name__)


def run_evidence(state: dict, store: DataStore) -> dict:
    start = time.perf_counter()
    claim = state.get("claim_data") or {}
    anomaly_type = state.get("anomaly_type")

    # Run each tool. All 4 sources are recorded, even on unavailability.
    ncci_finding, ncci_record = tools.ncci_lookup(claim)
    citations, rag_record = tools.rag_retrieval(claim, anomaly_type)
    provider_context, provider_record = tools.provider_history(claim, store)
    duplicates, duplicate_record = tools.duplicate_search(claim, store)

    sources: list[SourceRecord] = [
        ncci_record,
        rag_record,
        provider_record,
        duplicate_record,
    ]

    envelope = EvidenceEnvelope(
        policy_citations=citations,
        ncci_findings=ncci_finding,
        provider_context=provider_context,
        duplicate_matches=duplicates,
        sources_consulted=sources,
    )

    all_unavailable = all(s.status == "unavailable" for s in sources)
    status = "manual_review_required" if all_unavailable else "evidence_complete"
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "Evidence: claim=%s status=%s sources=%s elapsed=%.1fms",
        state.get("claim_id"),
        status,
        [f"{s.tool}={s.status}" for s in sources],
        elapsed_ms,
    )

    return {
        "evidence_results": envelope.model_dump(mode="json"),
        "investigation_status": status,
    }

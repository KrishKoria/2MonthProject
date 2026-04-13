"""Investigation SSE endpoint plus stored-result and polling-fallback routes.

Tasks T046, T048, T056a.

The streaming generator:
  1. Runs deterministic triage → emits `triage` event
  2. Runs deterministic evidence (all 4 sources) → emits `evidence` event
  3. On empty-evidence gate → emits `halt`, persists, returns
  4. Else streams the LLM rationale → emits N `rationale_chunk` events
  5. Emits `complete` with the full Investigation, and persists
  6. On any exception → emits `error` and persists an error record

All emitted events carry the required SSE headers via `stream_response`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies import get_data_store
from app.data.loader import DataStore
from app.data.schemas import (
    EvidenceEnvelope,
    HumanDecision,
    Investigation,
    InvestigationStatus,
    RationaleResult,
    TriageResult,
)
from app.orchestrator.evidence import run_evidence
from app.orchestrator.rationale import stream_rationale
from app.orchestrator.triage import run_triage
from app.utils.collections import ensure_list
from app.utils.sse import sse_event, stream_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/claims", tags=["investigation"])


def _envelope(data: Any) -> dict:
    return {
        "data": data,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data_source": "synthetic",
        },
    }


def _build_initial_state(store: DataStore, claim_id: str) -> dict:
    claim = store.get_claim(claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
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


def _triage_result(state: dict) -> TriageResult:
    return TriageResult(
        anomaly_type=state.get("anomaly_type"),
        anomaly_flags=state.get("anomaly_flags") or {},
        confidence=float(state.get("confidence") or 0.0),
        priority=state.get("priority") or "low",
        evidence_tools_to_use=list(state.get("evidence_tools_to_use") or []),
    )


def _persist(store: DataStore, inv: Investigation) -> None:
    try:
        store.save_investigation(inv)
    except Exception:  # persistence is best-effort for the stream
        logger.exception("Failed to persist investigation %s", inv.claim_id)


@router.post("/{claim_id}/investigate")
async def investigate(
    claim_id: str,
    store: Annotated[DataStore, Depends(get_data_store)],
):
    """Trigger the investigation pipeline and stream SSE events."""
    initial = _build_initial_state(store, claim_id)  # raises 404 before streaming begins

    async def gen() -> AsyncIterator[dict[str, str]]:
        state = dict(initial)
        created_at = datetime.now(timezone.utc)

        def now() -> datetime:
            return datetime.now(timezone.utc)

        try:
            # --- Triage ---
            state.update(run_triage(state))
            triage_result = _triage_result(state)
            yield sse_event("triage", triage_result.model_dump(mode="json"))

            # --- Evidence ---
            state.update(run_evidence(state, store))
            evidence_dict = state.get("evidence_results") or {}
            yield sse_event("evidence", evidence_dict)

            if state.get("investigation_status") == "manual_review_required":
                inv = Investigation(
                    claim_id=claim_id,
                    investigation_status=InvestigationStatus.MANUAL_REVIEW_REQUIRED,
                    triage=triage_result,
                    evidence=EvidenceEnvelope.model_validate(evidence_dict),
                    rationale=None,
                    created_at=created_at,
                    updated_at=now(),
                )
                _persist(store, inv)
                yield sse_event(
                    "halt",
                    {
                        "investigation_status": "manual_review_required",
                        "reason": "insufficient_evidence",
                        "sources_consulted": evidence_dict.get("sources_consulted", []),
                    },
                )
                return

            # --- Rationale (streamed) ---
            rationale_result: RationaleResult | None = None
            stream_error: str | None = None
            async for chunk in stream_rationale(state):
                kind = chunk.get("type")
                if kind == "chunk":
                    yield sse_event("rationale_chunk", {"text": chunk["text"]})
                elif kind == "complete":
                    rationale_result = chunk["result"]
                elif kind == "error":
                    stream_error = chunk.get("message") or "rationale_error"
                    break

            if stream_error or rationale_result is None:
                inv = Investigation(
                    claim_id=claim_id,
                    investigation_status=InvestigationStatus.ERROR,
                    triage=triage_result,
                    evidence=EvidenceEnvelope.model_validate(evidence_dict),
                    rationale=None,
                    created_at=created_at,
                    updated_at=now(),
                )
                _persist(store, inv)
                yield sse_event(
                    "error",
                    {
                        "investigation_status": "error",
                        "message": stream_error or "rationale_no_output",
                    },
                )
                return

            # --- Complete ---
            inv = Investigation(
                claim_id=claim_id,
                investigation_status=InvestigationStatus.COMPLETE,
                triage=triage_result,
                evidence=EvidenceEnvelope.model_validate(evidence_dict),
                rationale=rationale_result,
                created_at=created_at,
                updated_at=now(),
            )
            _persist(store, inv)
            yield sse_event("complete", inv.model_dump(mode="json"))

        except Exception as exc:
            logger.exception("Investigation failed for %s", claim_id)
            try:
                err_inv = Investigation(
                    claim_id=claim_id,
                    investigation_status=InvestigationStatus.ERROR,
                    created_at=created_at,
                    updated_at=now(),
                )
                _persist(store, err_inv)
            except Exception:
                logger.exception("Failed to persist error investigation for %s", claim_id)
            yield sse_event(
                "error",
                {"investigation_status": "error", "message": str(exc)},
            )

    return stream_response(gen())


@router.get("/{claim_id}/investigation")
async def get_investigation(
    claim_id: str,
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    """Return the stored investigation for a claim (404 if none)."""
    if store.get_claim(claim_id) is None:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
    inv = store.investigations.get(claim_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"No investigation for claim {claim_id}")
    return _envelope(inv.model_dump(mode="json"))


_DECISION_TO_STATUS = {
    "accepted": "accepted",
    "rejected": "rejected",
    "escalated": "escalated",
}


class DecisionRequest(BaseModel):
    decision: str = Field(pattern="^(accepted|rejected|escalated)$")
    notes: str | None = None


@router.patch("/{claim_id}/investigation")
async def submit_decision(
    claim_id: str,
    body: DecisionRequest,
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    """Record investigator decision (T056).

    Validates state machine transition via `update_claim_status`, writes
    `human_decision` onto the stored Investigation, and persists.
    """
    if store.get_claim(claim_id) is None:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
    inv = store.investigations.get(claim_id)
    if inv is None:
        raise HTTPException(
            status_code=409,
            detail=f"No investigation on file for {claim_id}; run /investigate first",
        )

    # Validate state transition (raises ValueError → 400 via global handler)
    store.update_claim_status(claim_id, _DECISION_TO_STATUS[body.decision])

    decided_at = datetime.now(timezone.utc)
    updated = inv.model_copy(
        update={
            "human_decision": HumanDecision(
                decision=body.decision,
                notes=body.notes,
                decided_at=decided_at,
            ),
            "updated_at": decided_at,
        }
    )
    store.save_investigation(updated)
    return _envelope(updated.model_dump(mode="json"))


@router.get("/{claim_id}/investigation/status")
async def investigation_status(
    claim_id: str,
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    """Polling fallback — returns current status plus whichever stages are complete."""
    if store.get_claim(claim_id) is None:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
    inv = store.investigations.get(claim_id)
    if inv is None:
        return _envelope({
            "investigation_status": "pending",
            "triage": None,
            "evidence": None,
            "rationale": None,
        })
    dumped = inv.model_dump(mode="json")
    return _envelope({
        "investigation_status": dumped["investigation_status"],
        "triage": dumped.get("triage"),
        "evidence": dumped.get("evidence"),
        "rationale": dumped.get("rationale"),
    })

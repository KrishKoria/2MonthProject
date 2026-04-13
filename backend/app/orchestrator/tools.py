"""Evidence tool wrappers used by the evidence node (T041).

Each tool returns a `(payload, SourceRecord)` pair. Payload shape varies by tool;
SourceRecord consistently marks `success | unavailable` with a machine-readable
reason for halts and downstream UX.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

import pandas as pd

from app.data.loader import DataStore
from app.data.schemas import DuplicateMatch, NCCIFinding, PolicyCitation, SourceRecord
from app.evidence.ncci_engine import NCCIEngine
from app.evidence.rag_retriever import RAGRetrievalError, retrieve

logger = logging.getLogger(__name__)


def _coerce_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, pd.Timestamp):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def ncci_lookup(
    claim: dict, *, engine: NCCIEngine | None = None
) -> tuple[NCCIFinding | None, SourceRecord]:
    """Check every CPT pair on the claim for an active NCCI edit."""
    proc_codes = list(claim.get("procedure_codes") or [])
    if len(proc_codes) < 2:
        return None, SourceRecord(
            tool="ncci_lookup", status="unavailable", reason="no_ncci_codes_in_claim"
        )
    service_date = _coerce_date(claim.get("service_date"))
    if service_date is None:
        return None, SourceRecord(
            tool="ncci_lookup", status="unavailable", reason="missing_service_date"
        )
    try:
        eng = engine or NCCIEngine()
        for i in range(len(proc_codes)):
            for j in range(i + 1, len(proc_codes)):
                res = eng.lookup_ncci_conflict(proc_codes[i], proc_codes[j], service_date)
                if res.get("conflict_exists"):
                    return (
                        NCCIFinding(**res),
                        SourceRecord(tool="ncci_lookup", status="success", reason=None),
                    )
    except Exception as exc:  # infrastructure error, not "no conflict"
        logger.warning("ncci_lookup engine error: %s", exc)
        return None, SourceRecord(
            tool="ncci_lookup", status="unavailable", reason="engine_error"
        )
    return None, SourceRecord(tool="ncci_lookup", status="success", reason="no_conflicts_found")


def rag_retrieval(
    claim: dict, anomaly_type: str | None, *, top_k: int = 5
) -> tuple[list[PolicyCitation], SourceRecord]:
    """Retrieve top-k CMS policy chunks relevant to the claim + anomaly type."""
    proc_codes = list(claim.get("procedure_codes") or [])
    parts: list[str] = []
    if anomaly_type:
        parts.append(anomaly_type.replace("_", " "))
    if proc_codes:
        parts.append("CPT " + " ".join(str(c) for c in proc_codes[:3]))
    parts.append("Medicare Part B billing policy")
    query = " ".join(parts).strip()
    try:
        citations = retrieve(query, top_k=top_k)
    except RAGRetrievalError as exc:
        return [], SourceRecord(
            tool="rag_retrieval", status="unavailable", reason=f"rag_backend_error: {exc}"[:200]
        )
    if not citations:
        return [], SourceRecord(tool="rag_retrieval", status="unavailable", reason="no_results")
    return citations, SourceRecord(tool="rag_retrieval", status="success", reason=None)


def provider_history(
    claim: dict, store: DataStore
) -> tuple[str | None, SourceRecord]:
    """Compose a short provider-peer comparison paragraph."""
    provider_id = claim.get("provider_id")
    if not provider_id:
        return None, SourceRecord(
            tool="provider_history", status="unavailable", reason="no_provider_id"
        )
    roster = store.provider_roster_df
    if roster is None or roster.empty:
        return None, SourceRecord(
            tool="provider_history", status="unavailable", reason="roster_unavailable"
        )
    matching = roster[roster["provider_id"] == provider_id]
    if matching.empty:
        return None, SourceRecord(
            tool="provider_history", status="unavailable", reason="provider_not_found"
        )
    specialty = str(matching.iloc[0]["specialty"])

    claims_df = store.claims_df
    this_charge = float(claim.get("charge_amount") or 0.0)
    proc_codes = list(claim.get("procedure_codes") or [])
    proc_summary = ", ".join(str(c) for c in proc_codes[:3]) or "n/a"

    if claims_df is None or claims_df.empty:
        summary = (
            f"Provider {provider_id} (specialty: {specialty}). "
            f"Current claim charge ${this_charge:,.0f} for CPT {proc_summary}; "
            "no peer claims available for comparison."
        )
        return summary, SourceRecord(tool="provider_history", status="success", reason=None)

    specialty_ids = roster.loc[roster["specialty"] == specialty, "provider_id"].tolist()
    peer_claims = claims_df[claims_df["provider_id"].isin(specialty_ids)]
    if peer_claims.empty:
        summary = (
            f"Provider {provider_id} (specialty: {specialty}). "
            f"Current claim charge ${this_charge:,.0f}; no peer claims for specialty."
        )
        return summary, SourceRecord(tool="provider_history", status="success", reason=None)

    peer_avg = float(peer_claims["charge_amount"].mean())
    provider_claims = claims_df[claims_df["provider_id"] == provider_id]
    provider_count = int(len(provider_claims))
    provider_avg = (
        float(provider_claims["charge_amount"].mean()) if provider_count else 0.0
    )
    claim_ratio = this_charge / peer_avg if peer_avg > 0 else 0.0
    provider_ratio = provider_avg / peer_avg if peer_avg > 0 else 0.0

    summary = (
        f"Provider {provider_id} (specialty: {specialty}) billed {provider_count} claims "
        f"averaging ${provider_avg:,.0f}, {provider_ratio:.2f}x the {specialty} "
        f"peer average of ${peer_avg:,.0f}. Current claim charge ${this_charge:,.0f} "
        f"is {claim_ratio:.2f}x the peer average for CPT {proc_summary}."
    )
    return summary, SourceRecord(tool="provider_history", status="success", reason=None)


def duplicate_search(
    claim: dict, store: DataStore, *, window_days: int = 3
) -> tuple[list[DuplicateMatch], SourceRecord]:
    """Search for near-duplicate claims (same member, ±window_days, overlapping CPTs)."""
    claims_df = store.claims_df
    if claims_df is None or claims_df.empty:
        return [], SourceRecord(
            tool="duplicate_search", status="unavailable", reason="claims_unavailable"
        )
    member_id = claim.get("member_id")
    this_id = claim.get("claim_id")
    sd = _coerce_date(claim.get("service_date"))
    if not member_id or sd is None:
        return [], SourceRecord(
            tool="duplicate_search",
            status="unavailable",
            reason="missing_member_or_date",
        )
    this_codes = set(claim.get("procedure_codes") or [])
    provider_id = claim.get("provider_id")

    df = claims_df
    sd_ts = pd.Timestamp(sd)
    # Vectorized masking (works on a view without mutating the store)
    service_ts = pd.to_datetime(df["service_date"], errors="coerce")
    day_diff = (service_ts - sd_ts).abs().dt.days
    mask = (df["member_id"] == member_id) & (df["claim_id"] != this_id) & (day_diff <= window_days)
    if provider_id:
        mask = mask & (df["provider_id"] == provider_id)

    candidates_idx = df.index[mask.fillna(False)]
    matches: list[DuplicateMatch] = []
    for idx in candidates_idx:
        row = df.loc[idx]
        other_codes = set(row.get("procedure_codes") or [])
        if this_codes and not (this_codes & other_codes):
            continue
        overlap = (
            len(this_codes & other_codes) / max(len(this_codes | other_codes), 1)
            if (this_codes or other_codes)
            else 0.0
        )
        diff = int(day_diff.loc[idx]) if pd.notna(day_diff.loc[idx]) else window_days
        date_sim = max(0.0, 1.0 - (diff / (window_days + 1)))
        sim = round(0.6 * overlap + 0.4 * date_sim, 3)
        other_sd = _coerce_date(row["service_date"])
        matches.append(
            DuplicateMatch(
                claim_id=str(row["claim_id"]),
                service_date=other_sd.isoformat() if other_sd else "",
                procedure_codes=sorted(str(c) for c in other_codes),
                similarity_score=sim,
            )
        )
    matches.sort(key=lambda m: m.similarity_score, reverse=True)
    return matches[:5], SourceRecord(tool="duplicate_search", status="success", reason=None)

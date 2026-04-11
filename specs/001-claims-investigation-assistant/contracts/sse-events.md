# SSE Event Schema: Investigation Stream

**Phase 1 Output** | Branch: `main` | Date: 2026-04-11

---

## Overview

`POST /api/claims/{claim_id}/investigate` returns a Server-Sent Events stream.

Events are emitted in this order:

```
triage → evidence → rationale_chunk (N times) → complete
                 └─ (if empty evidence) → halt
        └─ (on any exception) → error
```

---

## Required Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
Access-Control-Allow-Origin: *
```

Missing any of these causes silent browser-side failures (constitution V).

---

## Events

### event: triage

Emitted after deterministic triage node completes (<100ms).

```
event: triage
data: {
  "anomaly_type": "upcoding" | "ncci_violation" | "duplicate" | null,
  "anomaly_flags": {
    "upcoding": "detected" | "not_applicable" | "insufficient_data",
    "ncci_violation": "detected" | "not_applicable" | "insufficient_data",
    "duplicate": "detected" | "not_applicable" | "insufficient_data"
  },
  "confidence": 0.92,
  "priority": "high" | "medium" | "low",
  "evidence_tools_to_use": ["search_policy_docs", "get_provider_history"]
}
```

All 3 anomaly types always present in `anomaly_flags`. Never silently omitted (constitution VII).

---

### event: evidence

Emitted after deterministic evidence node completes (<2s from triage).

```
event: evidence
data: {
  "policy_citations": [
    {
      "text": "...",
      "source": "CMS Claims Processing Manual",
      "chapter": "12",
      "section": "30.6.1",
      "relevance_score": 0.94
    }
  ],
  "ncci_findings": {
    "conflict_exists": true,
    "edit_type": "unbundling",
    "effective_date": "2024-01-01"
  } | null,
  "provider_context": "Provider bills CPT 27447 at 3.1x specialty average..." | null,
  "duplicate_matches": [],
  "sources_consulted": [
    { "tool": "rag_retrieval", "status": "success", "reason": null },
    { "tool": "ncci_lookup", "status": "unavailable", "reason": "no_ncci_codes_in_claim" },
    { "tool": "provider_history", "status": "success", "reason": null },
    { "tool": "duplicate_search", "status": "success", "reason": null }
  ]
}
```

All 4 sources always present in `sources_consulted`, even if unavailable (constitution VII).

---

### event: rationale_chunk

Emitted repeatedly as the LLM streams its response (~5–10s total).

```
event: rationale_chunk
data: { "text": "This claim shows indicators" }

event: rationale_chunk
data: { "text": " consistent with upcoding..." }
```

Frontend accumulates chunks and renders progressively.

---

### event: complete

Emitted when the full investigation is persisted and ready. Contains the complete investigation result.

```
event: complete
data: {
  "claim_id": "CLM-2026-00482",
  "investigation_status": "complete",
  "triage": { ...TriageResult... },
  "evidence": { ...EvidenceEnvelope... },
  "rationale": {
    "summary": "...",
    "supporting_evidence": ["..."],
    "policy_citations": [...],
    "anomaly_flags_addressed": {
      "upcoding": "Primary finding: charge amount exceeds peer group by 3.1x...",
      "ncci_violation": null,
      "duplicate": null
    },
    "recommended_action": "Refer for clinical documentation review",
    "confidence": 0.88,
    "review_needed": true
  },
  "human_decision": null,
  "created_at": "2026-04-11T10:00:00Z",
  "updated_at": "2026-04-11T10:00:12Z"
}
```

---

### event: halt

Emitted when evidence node returns empty results. No rationale node is invoked (constitution III).

```
event: halt
data: {
  "investigation_status": "manual_review_required",
  "reason": "insufficient_evidence",
  "sources_consulted": [
    { "tool": "rag_retrieval", "status": "unavailable", "reason": "no_results" },
    { "tool": "ncci_lookup", "status": "unavailable", "reason": "no_ncci_codes_in_claim" },
    { "tool": "provider_history", "status": "unavailable", "reason": "provider_not_found" },
    { "tool": "duplicate_search", "status": "unavailable", "reason": "no_matches" }
  ]
}
```

---

### event: error

Emitted on any unhandled exception. The connection MUST NOT die silently (constitution V).

```
event: error
data: {
  "investigation_status": "error",
  "message": "LLM API timeout after 30s"
}
```

---

## Frontend Handling

```typescript
// lib/sse.ts
type InvestigationEvent =
  | { type: 'triage'; data: TriageResult }
  | { type: 'evidence'; data: EvidenceEnvelope }
  | { type: 'rationale_chunk'; data: { text: string } }
  | { type: 'complete'; data: Investigation }
  | { type: 'halt'; data: HaltResult }
  | { type: 'error'; data: { message: string } };

function streamInvestigation(
  claimId: string,
  onEvent: (event: InvestigationEvent) => void
): () => void {
  const source = new EventSource(`/api/claims/${claimId}/investigate`);
  // attach listeners for each event type
  // return cleanup function
}
```

---

## Timing Contract

| Event | Expected latency from trigger |
|-------|-------------------------------|
| `triage` | < 100ms |
| `evidence` | < 2s from triage |
| first `rationale_chunk` | < 5s from evidence |
| `complete` | < 15s total (SC-004) |
| `halt` | < 2s (no LLM call) |
| `error` | immediately on exception |

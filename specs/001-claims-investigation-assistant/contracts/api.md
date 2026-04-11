# API Contracts: Claims Investigation Intelligence Assistant

**Phase 1 Output** | Branch: `main` | Date: 2026-04-11

---

## Base URL

`http://localhost:8000/api`

---

## Response Envelope

All endpoints return:

```json
{
  "data": {},
  "metadata": {
    "timestamp": "2026-04-11T10:00:00Z",
    "processing_time_ms": 245,
    "data_source": "synthetic"
  }
}
```

Errors return:

```json
{
  "error": {
    "code": "string",
    "message": "string"
  },
  "metadata": { ... }
}
```

---

## Claims

### GET /api/claims

List claims with filtering and pagination.

**Query parameters**:

| Param | Type | Values |
|-------|------|--------|
| `status` | `string` | `pending_review`, `accepted`, `rejected`, `escalated`, `manual_review_required` |
| `risk_band` | `string` | `high`, `medium`, `low` |
| `anomaly_type` | `string` | `upcoding`, `ncci_violation`, `duplicate` |
| `provider_id` | `string` | exact match |
| `date_from` | `date` | ISO-8601 date |
| `date_to` | `date` | ISO-8601 date |
| `page` | `int` | default 1 |
| `page_size` | `int` | default 25, max 100 |
| `sort_by` | `string` | `risk_score` (default), `service_date`, `claim_receipt_date` |
| `sort_dir` | `string` | `desc` (default), `asc` |

**Response**:
```json
{
  "data": {
    "claims": [
      {
        "claim_id": "CLM-2026-00482",
        "member_id": "MBR-001234",
        "provider_id": "PRV-5678",
        "service_date": "2026-03-01",
        "claim_receipt_date": "2026-03-15",
        "procedure_codes": ["27447"],
        "charge_amount": 8450.00,
        "claim_status": "pending_review",
        "anomaly_type": "upcoding",
        "risk_score": 87,
        "risk_band": "high",
        "rules_flags": ["charge_outlier"]
      }
    ],
    "total": 1423,
    "page": 1,
    "page_size": 25
  }
}
```

---

### GET /api/claims/{claim_id}

Full claim details with risk score and investigation result (if exists).

**Response**:
```json
{
  "data": {
    "claim": { ...full Claim object... },
    "risk_score": {
      "xgboost_score": 87,
      "shap_values": { "charge_to_allowed_ratio": 0.31, "provider_peer_deviation": 0.28, ... },
      "rules_flags": ["charge_outlier"],
      "risk_band": "high",
      "scored_at": "2026-04-11T08:00:00Z"
    },
    "investigation": null
  }
}
```

---

## Investigation

### POST /api/claims/{claim_id}/investigate

Trigger investigation pipeline. Returns SSE stream (see [sse-events.md](./sse-events.md)).

**Response**: `EventSourceResponse` — see SSE Events contract.

**Required response headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
Access-Control-Allow-Origin: *
```

---

### GET /api/claims/{claim_id}/investigation

Retrieve stored investigation result.

**Response**:
```json
{
  "data": {
    "claim_id": "CLM-2026-00482",
    "investigation_status": "complete",
    "triage": {
      "anomaly_type": "upcoding",
      "anomaly_flags": {
        "upcoding": "detected",
        "ncci_violation": "not_applicable",
        "duplicate": "not_applicable"
      },
      "confidence": 0.92,
      "priority": "high",
      "evidence_tools_to_use": ["search_policy_docs", "get_provider_history"]
    },
    "evidence": {
      "policy_citations": [
        {
          "text": "...",
          "source": "CMS Claims Processing Manual",
          "chapter": "12",
          "section": "30.6.1",
          "relevance_score": 0.94
        }
      ],
      "ncci_findings": null,
      "provider_context": "Provider bills CPT 27447 at 3.1x specialty average...",
      "duplicate_matches": [],
      "sources_consulted": [
        { "tool": "rag_retrieval", "status": "success", "reason": null },
        { "tool": "ncci_lookup", "status": "unavailable", "reason": "no_ncci_codes_in_claim" },
        { "tool": "provider_history", "status": "success", "reason": null },
        { "tool": "duplicate_search", "status": "success", "reason": null }
      ]
    },
    "rationale": {
      "summary": "This claim shows indicators consistent with upcoding...",
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
}
```

---

### PATCH /api/claims/{claim_id}/investigation

Record investigator decision.

**Request body**:
```json
{
  "decision": "accepted",
  "notes": "Confirmed upcoding pattern, referring to audit."
}
```

**Allowed decision values**: `accepted`, `rejected`, `escalated`

**Response**: Updated Investigation object (same shape as GET response above).

**Side effect**: Updates `claim_status` on the Claim to match decision. Triggers state machine validation.

---

## Analytics

### GET /api/analytics/overview

Dashboard summary statistics.

**Response**:
```json
{
  "data": {
    "total_claims": 75000,
    "flagged_count": 4125,
    "high_risk_count": 892,
    "investigation_rate": 0.22,
    "avg_risk_score": 34.2,
    "anomaly_distribution": {
      "upcoding": 1650,
      "ncci_violation": 1237,
      "duplicate": 1238
    },
    "rules_baseline_flagged": 2100,
    "ml_only_flagged": 2025,
    "combined_flagged": 4125
  }
}
```

---

### GET /api/analytics/model-performance

ML metrics and ablation comparison. All metrics are on synthetic data.

**Response**:
```json
{
  "data": {
    "data_framing": "synthetic",
    "auc_roc": 0.91,
    "precision_at_k": { "k": 100, "precision": 0.84 },
    "precision_recall_curve": [
      { "threshold": 0.5, "precision": 0.82, "recall": 0.79 }
    ],
    "per_anomaly_recall": {
      "upcoding": 0.88,
      "ncci_violation": 0.93,
      "duplicate": 0.85
    },
    "ablation": {
      "rules_only": { "precision": 0.91, "recall": 0.51, "f1": 0.65 },
      "xgboost_only": { "precision": 0.84, "recall": 0.78, "f1": 0.81 },
      "combined": { "precision": 0.87, "recall": 0.89, "f1": 0.88 }
    }
  }
}
```

---

## NCCI

### GET /api/ncci/{code_1}/{code_2}

Direct NCCI conflict lookup.

**Query parameters**:

| Param | Type | Required |
|-------|------|----------|
| `service_date` | `date` (ISO-8601) | Yes |

**Response**:
```json
{
  "data": {
    "code_1": "27447",
    "code_2": "27446",
    "service_date": "2026-03-15",
    "conflict_exists": true,
    "edit_type": "unbundling",
    "effective_date": "2024-01-01",
    "rationale": "CPT 27446 is a component of 27447 and cannot be billed separately."
  }
}
```

---

## Polling Fallback

If SSE proves unreliable, the frontend can poll:

### GET /api/claims/{claim_id}/investigation/status

**Response**:
```json
{
  "data": {
    "investigation_status": "evidence_complete",
    "triage": { ... },
    "evidence": { ... },
    "rationale": null
  }
}
```

Poll every 500ms. Status progresses: `pending` → `triage_complete` → `evidence_complete` → `complete` | `manual_review_required` | `error`.

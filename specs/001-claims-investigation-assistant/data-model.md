# Data Model: Claims Investigation Intelligence Assistant

**Phase 1 Output** | Branch: `main` | Date: 2026-04-11

---

## Entities

### Claim

**Storage**: `data/processed/medical_claims.parquet`

| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | Unique identifier, format `CLM-YYYY-NNNNN` |
| `member_id` | `str` | Patient identifier |
| `provider_id` | `str` | Synthetic NPI |
| `service_date` | `date` | Date of service (NOT used for temporal features) |
| `claim_receipt_date` | `date` | Synthetic submission date (lognormal lag from service_date) — temporal anchor for ALL feature aggregations |
| `procedure_codes` | `list[str]` | CPT/HCPCS codes billed |
| `diagnosis_codes` | `list[str]` | ICD-10 codes |
| `modifiers` | `list[str]` | CPT modifiers |
| `charge_amount` | `float` | Amount billed |
| `allowed_amount` | `float` | Allowed amount |
| `paid_amount` | `float` | Amount paid |
| `place_of_service` | `str` | CMS POS code |
| `claim_status` | `str` | See state machine below |
| `anomaly_type` | `str \| null` | Ground-truth label from injection |

**Claim status state machine**:
```
pending_review → accepted
pending_review → rejected
pending_review → escalated
pending_review → manual_review_required
```
Reverse transitions and undefined states are domain errors (constitution VI).

**Allowed status values** (constitution IV): `pending_review`, `accepted`, `rejected`, `escalated`, `manual_review_required`

**Allowed anomaly_type values** (constitution IV): `upcoding`, `ncci_violation`, `duplicate`, `null`

---

### RiskScore

**Storage**: `data/scores/risk_scores.parquet`

| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | Foreign key to Claim |
| `xgboost_score` | `float` | 0–100 normalized risk score |
| `shap_values` | `dict[str, float]` | Per-feature Shapley values |
| `rules_flags` | `list[str]` | `ncci_conflict`, `charge_outlier`, `duplicate_match` |
| `risk_band` | `str` | `high` (score >= 70), `medium` (40–69), `low` (< 40) |
| `scored_at` | `datetime` | Batch scoring timestamp |

**SHAP invariant** (constitution VI): `abs(sum(shap_values.values()) - (xgboost_score_raw - base_value)) < 1e-5`. Violation blocks rationale node.

---

### AnomalyLabel

**Storage**: `data/processed/anomaly_labels.parquet`

| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | Foreign key to Claim |
| `anomaly_type` | `str` | `upcoding`, `ncci_violation`, `duplicate` |
| `anomaly_subtype` | `str \| null` | E.g., `cross_category_upcoding` |
| `injection_params` | `dict` | Parameters used to inject the anomaly |
| `split` | `str` | `train` or `test` — distribution partitioning |

---

### Investigation

**Storage**: In-memory dict keyed by `claim_id` (persisted to `data/scores/investigations.parquet` on write)

| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | |
| `investigation_status` | `str` | See status values below |
| `triage` | `TriageResult \| null` | Set after triage node |
| `evidence` | `EvidenceEnvelope \| null` | Set after evidence node |
| `rationale` | `RationaleResult \| null` | Set after rationale node; null if manual_review_required |
| `human_decision` | `HumanDecision \| null` | Investigator outcome |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

**Investigation status values**: `pending`, `triage_complete`, `evidence_complete`, `complete`, `manual_review_required`, `error`

---

### TriageResult (Pydantic model)

| Field | Type | Notes |
|-------|------|-------|
| `anomaly_type` | `str \| null` | Primary anomaly classification |
| `anomaly_flags` | `dict[str, str]` | All 3 types: `"detected"`, `"not_applicable"`, or `"insufficient_data"` — never silently omitted (constitution VII) |
| `confidence` | `float` | 0.0–1.0 |
| `priority` | `str` | `high`, `medium`, `low` |
| `evidence_tools_to_use` | `list[str]` | Tools selected for evidence node |

---

### EvidenceEnvelope (Pydantic model)

| Field | Type | Notes |
|-------|------|-------|
| `policy_citations` | `list[PolicyCitation]` | Retrieved RAG chunks |
| `ncci_findings` | `NCCIFinding \| null` | NCCI lookup result |
| `provider_context` | `str \| null` | Provider billing history summary |
| `duplicate_matches` | `list[DuplicateMatch]` | Potential duplicate claims |
| `sources_consulted` | `list[SourceRecord]` | ALL 4 sources listed with status (constitution VII) |

**SourceRecord**:
```python
class SourceRecord(BaseModel):
    tool: str  # "ncci_lookup" | "rag_retrieval" | "provider_history" | "duplicate_search"
    status: str  # "success" | "unavailable"
    reason: str | None  # Required when status == "unavailable"
```

**Empty evidence gate** (constitution III): If all sources return no results, halt pipeline with `investigation_status: "manual_review_required"`. Do NOT invoke rationale node.

---

### RationaleResult (Pydantic model)

| Field | Type | Notes |
|-------|------|-------|
| `summary` | `str` | High-level finding summary |
| `supporting_evidence` | `list[str]` | Key evidence points |
| `policy_citations` | `list[PolicyCitation]` | Must reference only retrieved RAG chunks |
| `anomaly_flags_addressed` | `dict[str, str \| null]` | Must address ALL flags raised by triage (constitution VII) |
| `recommended_action` | `str` | Next step for investigator |
| `confidence` | `float` | 0.0–1.0 |
| `review_needed` | `bool` | |

**Validation**: Pydantic schema validation on LLM output. Schema violation raises, not swallowed (constitution VI).

---

### HumanDecision (Pydantic model)

| Field | Type | Notes |
|-------|------|-------|
| `decision` | `str` | `accepted`, `rejected`, `escalated` |
| `notes` | `str \| null` | Investigator free text |
| `decided_at` | `datetime` | |
| `investigator_id` | `str` | Placeholder for v1 (single user demo) |

---

### PolicyCitation (Pydantic model)

| Field | Type | Notes |
|-------|------|-------|
| `text` | `str` | Retrieved chunk text |
| `source` | `str` | Document name |
| `chapter` | `str \| null` | Chapter reference |
| `section` | `str \| null` | Section reference |
| `relevance_score` | `float` | Cosine similarity |

---

### NCCIEdit

**Storage**: `data/ncci/practitioner_ptp_edits.csv`

| Field | Type | Notes |
|-------|------|-------|
| `code_1` | `str` | Primary CPT code |
| `code_2` | `str` | Modifier CPT code |
| `effective_date` | `date` | Edit effective date |
| `deletion_date` | `date \| null` | Null if still active |
| `modifier_indicator` | `str` | `0`, `1`, `9` — bypass logic deferred to v2 |

---

### Provider

**Storage**: `data/processed/provider_roster.parquet`

| Field | Type | Notes |
|-------|------|-------|
| `provider_id` | `str` | Synthetic NPI |
| `specialty` | `str` | CMS specialty code |
| `name` | `str` | Synthetic name |
| `location_state` | `str` | 2-letter state code |

---

## Feature Manifest

**Path**: `src/features/manifest.yml` (required by constitution VII)

```yaml
claim_features:
  - charge_amount
  - allowed_amount
  - paid_amount
  - charge_to_allowed_ratio
  - num_procedure_codes
  - num_diagnosis_codes
  - days_between_service_and_submission
  - place_of_service_encoded
  - procedure_complexity_score
  - has_ncci_conflict
  - modifier_count
  - modifier_59_present

provider_features:
  - provider_avg_charge_30d
  - provider_claim_volume_30d
  - provider_specialty_charge_ratio
  - provider_unique_patients_30d
  - provider_procedure_concentration
  - provider_peer_deviation

member_features:
  - member_claim_frequency_90d
  - member_unique_providers_90d
  - member_avg_charge_90d
  - member_chronic_condition_count
```

A missing feature at inference time raises `FeatureComputationError` — never defaults to zero (constitution VII).

---

## Relationships

```
Claim 1──1 RiskScore
Claim 1──1 AnomalyLabel (injected claims only)
Claim 1──1 Investigation
Investigation 1──1 TriageResult
Investigation 1──1 EvidenceEnvelope
Investigation 1──0..1 RationaleResult
Investigation 1──0..1 HumanDecision
EvidenceEnvelope *──* PolicyCitation
EvidenceEnvelope 1──0..1 NCCIFinding
EvidenceEnvelope 4──4 SourceRecord (one per tool, always)
```

---

## Validation Rules

- Claim status transitions must follow the defined state machine; violations raise domain errors
- SHAP invariant must hold within `1e-5` tolerance before rationale node runs
- LLM output must pass Pydantic schema validation; violations raise, not swallow
- All 4 evidence sources must be recorded in `sources_consulted` even if unavailable
- All 3 anomaly types must appear in `anomaly_flags` and `anomaly_flags_addressed`
- Features missing from manifest raise `FeatureComputationError`

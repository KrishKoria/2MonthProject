# Implementation Plan: Claims Investigation Intelligence Assistant

**Branch**: `main` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: AI-powered Claims Investigation Intelligence Assistant for Medicare Part B professional claims — combining risk scoring, policy evidence retrieval, and AI-synthesized investigation rationales with human-in-the-loop review.

---

## Summary

Build a full-stack payment integrity platform that:
1. Ingests synthetic Medicare Part B claims (Synthea + injected anomalies)
2. Scores each claim using XGBoost + SHAP for explainable risk detection
3. Provides a deterministic NCCI code-pair conflict lookup engine
4. Retrieves supporting policy evidence via RAG over public CMS documents
5. Orchestrates a mostly-deterministic LangGraph investigation pipeline with a single LLM synthesis call streamed via SSE
6. Surfaces results through a Next.js dashboard with three pages: dashboard, claims explorer, and claim detail + investigation view

All data is synthetic. The platform is a capability demonstration with production-architecture patterns (medallion schema, Parquet-native, Abacus-compatible).

---

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5.x (frontend)
**Primary Dependencies**:
- Backend: FastAPI, LangGraph, LangChain, ChromaDB, XGBoost, SHAP, scikit-learn, Pandas, Polars, Pydantic v2, sse-starlette, openai
- Frontend: Next.js 14 (App Router), Tailwind CSS, shadcn/ui (base-ui), Recharts, TypeScript

**Storage**: Parquet files loaded into memory at FastAPI startup (medallion: `raw/`, `processed/`, `features/`, `scores/`). ChromaDB for vector store. NCCI rules as CSV. No relational DB / ORM.

**Testing**: pytest (backend), Jest / Vitest (frontend)

**Target Platform**: Local development server (Docker-compose optional). Abacus-portable patterns.

**Project Type**: Full-stack web application (frontend + backend monorepo)

**Performance Goals**:
- Full investigation pipeline (triage + evidence + rationale): < 15 seconds
- Triage node: < 100ms
- Evidence node: < 2s
- LLM rationale: streamed (~5–10s)

**Constraints**:
- No relational DB — Parquet in-memory only (constitution §IV)
- Exactly 3 frontend pages — no additions (constitution §V)
- SSE must be implemented before investigation UI is released (constitution §V)
- LLM used only in rationale node — triage and evidence are deterministic (constitution §I)
- XGBoost only (no Isolation Forest) — constitution §VIII / deferral register
- Grouped temporal split: 70/15/15 by `claim_receipt_date`, no provider in both train and test

**Scale/Scope**: ~50K–100K synthetic claims (Parquet in-memory); ~50 policy documents chunked into ChromaDB; single-user demo workload

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Check | Status |
|---|-----------|-------|--------|
| I | Deterministic First, LLM Last | Triage node = deterministic Python; Evidence node = deterministic tools; Rationale node = single LLM call. No LLM in triage/evidence. | ✅ PASS |
| II | Test-First for Temporal Integrity | `test_no_future_leakage()` must be written and confirmed FAILING before feature engineering code is written. Lookback uses `claim_receipt_date`, strict `<` inequality. | ✅ PASS — will be enforced as task ordering constraint |
| III | Evidence-Gated Synthesis | Empty evidence halts the pipeline with `manual_review_required`. No LLM call on empty context. Citations reference only retrieved RAG chunks. | ✅ PASS |
| IV | Parquet-Native Data Layer | All Parquet loaded at FastAPI startup. No runtime I/O in request handlers. Medallion schema (`raw/`, `processed/`, `features/`, `scores/`). Status and anomaly type enums as specified. | ✅ PASS |
| V | Minimal Viable Surface | Exactly 3 pages: `/`, `/claims`, `/claims/[id]`. SSE is a delivery-blocking dependency. Required SSE headers enforced. Error events on all exceptions. | ✅ PASS |
| VI | Output Correctness | Feature regression tests against hand-computed fixtures (≥10 claims, ≥2 per anomaly type). XGBoost precision ≥ 0.75 gate. SHAP sum check (< 1e-5 tolerance). NCCI fixture cross-check. Pydantic schema validation on LLM output. Claim status state machine enforced. | ✅ PASS — will be enforced as test requirements |
| VII | Investigation Completeness | Triage evaluates all 3 anomaly types with explicit `not_applicable` flags. Evidence attempts all 4 sources; failures recorded as `{"status": "unavailable", "reason": ...}`. LLM rationale addresses all raised anomaly flags. Feature manifest at `src/features/manifest.yml`. ≥80% line coverage on `src/features/`, `src/pipeline/`, `src/api/`. Investigation report includes all required fields. | ✅ PASS — will be enforced as implementation contracts |
| Eng | Engineering Quality Standards | Python: type hints on all public functions, Pydantic models for all schemas, async route handlers and nodes, no bare `except:`. TypeScript: strict mode, no `any` without justification, named exports, co-located types. LLM mocked in orchestrator integration tests. Data layer NOT mocked (real Parquet fixtures). XGBoost + SHAP TreeExplainer only. | ✅ PASS |
| Scope | Deferral Register | Isolation Forest, embedded chat, full modifier-bypass, multi-agent LLM, SQLite/ORM, full analytics page, production auth, real PHI — all deferred. | ✅ PASS — none of these are in scope |

**Constitution Check Result: ALL GATES PASS.** No violations to justify. Proceeding to Phase 0.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-claims-investigation-assistant/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── api.md           # FastAPI REST + SSE contracts
│   └── sse-events.md    # SSE event schema
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml                    # Python project config (uv / pip)
├── app/
│   ├── main.py                       # FastAPI app, Parquet load at startup
│   ├── config.py                     # Settings (env vars, paths)
│   ├── api/
│   │   ├── routes/
│   │   │   ├── claims.py             # GET /api/claims, GET /api/claims/{id}
│   │   │   ├── investigation.py      # POST/GET/PATCH /api/claims/{id}/investigation (SSE)
│   │   │   ├── analytics.py          # GET /api/analytics/*
│   │   │   └── ncci.py               # GET /api/ncci/{code_1}/{code_2}
│   │   └── dependencies.py           # Injected data store + orchestrator
│   │
│   ├── ml/
│   │   ├── features.py               # Point-in-time feature engineering
│   │   ├── model.py                  # XGBoost training + scoring
│   │   ├── rules_baseline.py         # Deterministic rules for ablation
│   │   ├── explainer.py              # SHAP TreeExplainer
│   │   └── pipeline.py               # End-to-end batch scoring
│   │
│   ├── evidence/
│   │   ├── ncci_engine.py            # Simplified NCCI conflict lookup
│   │   ├── rag_ingest.py             # Document parsing + chunking
│   │   ├── rag_embeddings.py         # Embedding + ChromaDB indexing
│   │   └── rag_retriever.py          # Semantic retrieval
│   │
│   ├── orchestrator/
│   │   ├── graph.py                  # LangGraph state + graph definition
│   │   ├── triage.py                 # Deterministic triage node
│   │   ├── evidence.py               # Deterministic evidence node
│   │   ├── rationale.py              # LLM synthesis node (single call)
│   │   ├── tools.py                  # Tool definitions for evidence node
│   │   └── prompts/
│   │       └── rationale.md          # Rationale synthesis prompt
│   │
│   ├── data/
│   │   ├── loader.py                 # Parquet → in-memory DataFrames at startup
│   │   └── schemas.py                # Pydantic models for all data contracts
│   │
│   └── utils/
│       └── sse.py                    # SSE streaming helpers
│
├── data_generation/
│   ├── generate_synthea.py
│   ├── inject_anomalies.py           # 3 anomaly types, distribution partitioning
│   ├── generate_receipt_dates.py     # Lognormal lag from service_date
│   ├── calibrate.py
│   └── validate.py
│
├── scripts/
│   ├── setup_evidence.py             # RAG ingestion + NCCI data load
│   ├── train_model.py                # XGBoost training + eval + ablation
│   └── score_claims.py              # Batch scoring + SHAP computation
│
└── tests/
    ├── fixtures/                     # Parquet fixture files for tests
    ├── test_features.py              # Point-in-time correctness (test_no_future_leakage)
    ├── test_model.py
    ├── test_rules_baseline.py
    ├── test_ncci_engine.py           # NCCI fixture cross-checks
    ├── test_retriever.py
    ├── test_orchestrator.py          # Triage routing, halt condition, mocked LLM
    └── test_api.py

frontend/
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                  # Dashboard
    │   └── claims/
    │       ├── page.tsx              # Claims explorer
    │       └── [id]/
    │           └── page.tsx          # Claim detail + investigation
    │
    ├── components/
    │   ├── ui/                       # shadcn/ui base components
    │   ├── dashboard/                # KPI cards, risk distribution, ablation summary
    │   ├── claims/                   # Claims table, filters
    │   ├── investigation/            # Risk gauge, SHAP waterfall, evidence cards, rationale stream
    │   └── charts/                   # Recharts wrappers
    │
    └── lib/
        ├── api.ts                    # Typed API client
        ├── sse.ts                    # SSE client for investigation stream
        └── types.ts                  # Shared TypeScript types

data/
├── raw/                              # Synthea output (Bronze)
│   ├── patients.csv
│   ├── encounters.csv
│   ├── claims.csv
│   └── providers.csv
├── processed/                        # Silver: processed Parquet
│   ├── medical_claims.parquet
│   ├── member_eligibility.parquet
│   ├── provider_roster.parquet
│   └── anomaly_labels.parquet
├── features/                         # Gold: ML-ready feature tables
│   ├── claim_features.parquet
│   └── provider_features.parquet
├── scores/                           # Model outputs
│   ├── risk_scores.parquet
│   └── model_metadata.json
├── ncci/                             # NCCI structured rules (NOT in RAG)
│   ├── practitioner_ptp_edits.csv
│   └── ncci_metadata.json
└── policy_docs/                      # RAG corpus
    ├── cms_claims_manual/
    ├── hcpcs_descriptions/
    └── fraud_guidelines/

src/
└── features/
    └── manifest.yml                  # Feature manifest (constitution §VII)
```

**Structure Decision**: Web application (Option 2) with pre-existing `frontend/` and `backend/` directories. Backend is currently empty — full structure to be created. Frontend has Next.js scaffolding.

---

## Complexity Tracking

> No constitution violations requiring justification.

---

## Phase 0: Research

*See [research.md](./research.md)*

### Resolved Decisions

#### R-001: LangGraph State Schema Design

**Decision**: Use a single `InvestigationState` TypedDict as the LangGraph state. All nodes read from and write to this shared state object.

**Fields**:
```python
class InvestigationState(TypedDict):
    claim_id: str
    claim_data: ClaimData
    xgboost_risk_score: float
    shap_values: dict[str, float]
    rules_flags: list[str]
    anomaly_type: str | None          # "upcoding" | "ncci_violation" | "duplicate" | None
    anomaly_flags: dict[str, str]     # type → "detected" | "not_applicable" | "insufficient_data"
    confidence: float | None
    priority: str | None              # "high" | "medium" | "low"
    evidence_tools_to_use: list[str]
    evidence_results: EvidenceEnvelope | None
    rationale: RationaleResult | None
    investigation_status: str         # "pending" | "triage_complete" | "evidence_complete" | "complete" | "manual_review_required" | "error"
    error_message: str | None
```

**Rationale**: Single-state design matches LangGraph's recommended pattern. Typed state with Pydantic models at boundaries gives constitution §VI output correctness.

**Alternatives considered**: Separate state per node (rejected — too complex for three linear nodes); using LangChain agents (rejected — multi-agent contradicts constitution §I).

---

#### R-002: SSE Streaming Architecture

**Decision**: Use `sse-starlette` for FastAPI SSE. The investigation endpoint `POST /api/claims/{id}/investigate` returns an `EventSourceResponse`. Events emitted in order: `triage`, `evidence`, `rationale_chunk` (multiple), `complete`, or `halt`/`error`.

**Rationale**: `sse-starlette` is the standard SSE library for FastAPI. Required headers must be set per constitution §V: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, CORS headers.

**Fallback**: If SSE proves unreliable, polling endpoint `GET /api/claims/{id}/investigation/status` every 500ms. Must be designed from the start (constitution §V).

**Alternatives considered**: WebSockets (overkill for unidirectional stream), long-polling (less clean).

---

#### R-003: Point-in-Time Feature Engineering Strategy

**Decision**: Per-claim temporal join using `claim_receipt_date` with strict `<` inequality. For provider/member aggregate features, compute a rolling window for each claim by filtering to prior-received claims only. Use Pandas `merge_asof` or explicit per-claim aggregation, not compute-then-join.

**Rationale**: Prevents three identified temporal leakage bugs (off-by-one with `<=`, compute-then-join, wrong date column). Constitution §II mandates `test_no_future_leakage()` written and FAILING before any feature code is committed.

**Implementation approach**: Write `tests/test_features.py::test_no_future_leakage` first. Use `Polars` for the per-claim lookback window computation (lazy evaluation avoids compute-then-join by construction).

**Alternatives considered**: Polars lazy joins (preferred for correctness guarantees), Pandas explicit loops (too slow at 100K scale), pre-aggregated tables (risks leakage if not careful).

---

#### R-004: ChromaDB Collection Design

**Decision**: Single ChromaDB collection `cms_policy` with metadata fields: `source` (document name), `chapter`, `section`, `topic` (`billing` | `fraud` | `coding` | `ncci_background`). Chunk size: ~500 tokens, 50-token overlap. Embedding: `text-embedding-3-small`.

**Rationale**: Single collection with rich metadata allows both semantic search and metadata-filtered search. Keeps operational footprint minimal (constitution §V — minimal viable surface).

**Alternatives considered**: Per-document collections (harder to cross-source search), multi-collection (no benefit at this corpus size).

---

#### R-005: XGBoost Training and Evaluation Pipeline

**Decision**: Grouped temporal split — sort by `claim_receipt_date`, first 70% → train, next 15% → validation, last 15% → test. Apply group constraint: no `provider_id` in both train and test. Use different anomaly injection parameter distributions for train vs. test (per §2.2 of design spec).

**Model promotion gate**: Precision at operating threshold ≥ 0.75 (constitution §VI). If not met, do not promote to inference.

**Rationale**: Prevents temporal leakage and provider-level information leakage. Injection distribution partitioning measures generalization to unseen anomaly variants, not memorization.

**Alternatives considered**: Random split (rejected — leakage), stratified by anomaly type only (rejected — misses temporal and provider constraints).

---

#### R-006: NCCI Rules Engine Implementation

**Decision**: Load `practitioner_ptp_edits.csv` into a Pandas DataFrame at startup. Implement `lookup_ncci_conflict(code_1, code_2, service_date)` as an exact-match lookup: normalize code order (sorted tuple), filter by date range (`effective_date <= service_date < deletion_date`). Return `{conflict_exists: bool, edit_type: str, effective_date: str, rationale: str}`.

**V2 extension point**: `modifier_indicator` field is in the CSV but modifier-bypass logic is deferred. Document where it plugs in.

**Rationale**: Deterministic structured lookup, not semantic search (constitution §I, §IV). CSV exact-match is the right tool for structured data.

**Alternatives considered**: SQLite for NCCI lookups (rejected per constitution §IV deferral register), RAG over NCCI edits (incorrect — RAG is for unstructured text, not structured rules).

---

#### R-007: Rationale Prompt Design

**Decision**: Single structured prompt with all evidence pre-assembled. Prompt enforces JSON output schema via Pydantic. LLM model: OpenAI `gpt-4o` (primary) or Anthropic `claude-sonnet-4-6` (secondary). Output schema:
```json
{
  "summary": "string",
  "supporting_evidence": ["string"],
  "policy_citations": [{"source": "string", "text": "string", "relevance": "float"}],
  "anomaly_flags_addressed": {"upcoding": "string | null", "ncci_violation": "string | null", "duplicate": "string | null"},
  "recommended_action": "string",
  "confidence": "float (0–1)",
  "review_needed": "boolean"
}
```

**Validation gate**: Prompt must be validated against ≥50 sample claims before production inference path is activated. Target: >85% acceptable in manual structured review (constitution §III).

**Rationale**: One well-prompted call with complete pre-gathered context produces more reliable results than multi-step LLM reasoning. Strict JSON schema enforced via Pydantic prevents schema violations from being swallowed.

**Alternatives considered**: Multi-agent LLM orchestration (rejected — deferred to v2 per constitution deferral register).

---

## Phase 1: Design

### Data Model

*See [data-model.md](./data-model.md)*

#### Core Entities

**Claim** (`data/processed/medical_claims.parquet`)
| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | Unique identifier, format `CLM-YYYY-NNNNN` |
| `member_id` | `str` | Patient identifier |
| `provider_id` | `str` | NPI or synthetic identifier |
| `service_date` | `date` | Date of service |
| `claim_receipt_date` | `date` | Synthetic submission date (lognormal lag from service_date) |
| `procedure_codes` | `list[str]` | CPT/HCPCS codes billed |
| `diagnosis_codes` | `list[str]` | ICD-10 codes |
| `modifiers` | `list[str]` | CPT modifiers |
| `charge_amount` | `float` | Amount billed |
| `allowed_amount` | `float` | Allowed amount |
| `paid_amount` | `float` | Amount paid |
| `place_of_service` | `str` | CMS POS code |
| `claim_status` | `str` | `pending_review` \| `accepted` \| `rejected` \| `escalated` \| `manual_review_required` |
| `anomaly_type` | `str \| null` | `upcoding` \| `ncci_violation` \| `duplicate` \| null |

**State Machine**: `pending_review → {accepted | rejected | escalated | manual_review_required}`. Reverse transitions are domain errors.

**RiskScore** (`data/scores/risk_scores.parquet`)
| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | Foreign key to Claim |
| `xgboost_score` | `float` | 0–100 normalized |
| `shap_values` | `dict[str, float]` | Per-feature attributions |
| `rules_flags` | `list[str]` | `ncci_conflict` \| `charge_outlier` \| `duplicate_match` |
| `risk_band` | `str` | `high` \| `medium` \| `low` |
| `scored_at` | `datetime` | Batch scoring timestamp |

**Investigation** (in-memory dict, keyed by `claim_id`)
| Field | Type | Notes |
|-------|------|-------|
| `claim_id` | `str` | |
| `investigation_status` | `str` | `pending` \| `triage_complete` \| `evidence_complete` \| `complete` \| `manual_review_required` \| `error` |
| `triage` | `TriageResult` | Anomaly type, confidence, priority, tools selected |
| `evidence` | `EvidenceEnvelope` | All tool results (including unavailable sources) |
| `rationale` | `RationaleResult \| null` | LLM output (null if manual_review_required) |
| `human_decision` | `HumanDecision \| null` | Investigator outcome |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

**HumanDecision**
| Field | Type | Notes |
|-------|------|-------|
| `decision` | `str` | `accepted` \| `rejected` \| `escalated` |
| `notes` | `str \| null` | Investigator free text |
| `decided_at` | `datetime` | |
| `investigator_id` | `str` | Placeholder for v1 (single user) |

**PolicyCitation**
| Field | Type | Notes |
|-------|------|-------|
| `text` | `str` | Retrieved chunk text |
| `source` | `str` | Document name |
| `chapter` | `str \| null` | Chapter reference |
| `section` | `str \| null` | Section reference |
| `relevance_score` | `float` | Cosine similarity |

**NCCIEdit** (`data/ncci/practitioner_ptp_edits.csv`)
| Field | Type | Notes |
|-------|------|-------|
| `code_1` | `str` | Primary CPT code |
| `code_2` | `str` | Modifier CPT code |
| `effective_date` | `date` | Edit effective date |
| `deletion_date` | `date \| null` | Null if still active |
| `modifier_indicator` | `str` | `0` \| `1` \| `9` — modifier bypass logic (v2) |

**Provider** (`data/processed/provider_roster.parquet`)
| Field | Type | Notes |
|-------|------|-------|
| `provider_id` | `str` | Synthetic NPI |
| `specialty` | `str` | CMS specialty code |
| `name` | `str` | Synthetic name |
| `location_state` | `str` | 2-letter state |

**Feature Manifest** (`src/features/manifest.yml`) — constitution §VII requirement:
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

---

### Interface Contracts

*See [contracts/api.md](./contracts/api.md) and [contracts/sse-events.md](./contracts/sse-events.md)*

#### REST API Contracts

**Base URL**: `http://localhost:8000/api`

**Response envelope** (all endpoints):
```json
{
  "data": {},
  "metadata": {
    "timestamp": "ISO-8601",
    "processing_time_ms": 0,
    "data_source": "synthetic"
  }
}
```

**GET /api/claims**
Query params: `status`, `risk_band`, `anomaly_type`, `provider_id`, `date_from`, `date_to`, `page`, `page_size`
Response: `{ data: { claims: Claim[], total: int, page: int } }`

**GET /api/claims/{claim_id}**
Response: `{ data: { claim: Claim, risk_score: RiskScore, investigation: Investigation | null } }`

**POST /api/claims/{claim_id}/investigate**
Response: SSE stream (see SSE Events below)
Headers required: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, CORS

**GET /api/claims/{claim_id}/investigation**
Response: `{ data: Investigation }`

**PATCH /api/claims/{claim_id}/investigation**
Body: `{ decision: "accepted" | "rejected" | "escalated", notes?: string }`
Response: `{ data: Investigation }`

**GET /api/analytics/overview**
Response: `{ data: { total_claims: int, flagged_count: int, high_risk_count: int, anomaly_distribution: {...}, rules_baseline_flagged: int, ml_only_flagged: int } }`

**GET /api/analytics/model-performance**
Response: `{ data: { auc_roc: float, precision_recall_curve: [...], precision_at_k: float, per_type_recall: {...}, ablation: { rules_only: {...}, xgboost_only: {...}, combined: {...} } } }`

**GET /api/ncci/{code_1}/{code_2}**
Query params: `service_date`
Response: `{ data: { conflict_exists: bool, edit_type: str | null, effective_date: str | null, rationale: str | null } }`

#### SSE Event Stream Schema

Events emitted by `POST /api/claims/{id}/investigate`:

```
event: triage
data: { "anomaly_type": "upcoding"|"ncci_violation"|"duplicate"|null, "confidence": 0.92, "priority": "high"|"medium"|"low", "evidence_tools_used": ["search_policy_docs", "get_provider_history"], "anomaly_flags": { "upcoding": "detected"|"not_applicable", "ncci_violation": "detected"|"not_applicable", "duplicate": "detected"|"not_applicable" } }

event: evidence
data: { "policy_citations": [...], "ncci_findings": {...}|null, "provider_context": "string"|null, "duplicate_matches": [...]|null, "sources_consulted": [ { "tool": "string", "status": "success"|"unavailable", "reason": "string"|null } ] }

event: rationale_chunk
data: { "text": "partial string" }

event: complete
data: { ...full Investigation object... }

event: halt
data: { "reason": "insufficient_evidence", "investigation_status": "manual_review_required" }

event: error
data: { "message": "string", "investigation_status": "error" }
```

---

### Quickstart

*See [quickstart.md](./quickstart.md)*

#### Prerequisites
- Python 3.11+
- Node.js 18+ / Bun
- OpenAI API key (for embeddings + LLM)
- Java 11+ (for Synthea data generation)

#### Backend Setup
```bash
cd backend
pip install -e ".[dev]"   # or: uv sync
cp .env.example .env      # set OPENAI_API_KEY
```

#### Data Generation & Indexing
```bash
# 1. Generate synthetic claims (~50K records)
python data_generation/generate_synthea.py
python data_generation/inject_anomalies.py
python data_generation/generate_receipt_dates.py

# 2. Feature engineering + model training
python scripts/train_model.py    # outputs data/scores/ + model_metadata.json

# 3. Batch scoring (all claims)
python scripts/score_claims.py

# 4. Index RAG corpus + load NCCI
python scripts/setup_evidence.py
```

#### Run Backend
```bash
uvicorn app.main:app --reload --port 8000
```

#### Frontend Setup
```bash
cd frontend
bun install   # or: npm install
bun run dev   # http://localhost:3000
```

#### Verification
- Dashboard: http://localhost:3000 — should show flagged claims, risk distribution, ablation summary
- Claims explorer: http://localhost:3000/claims — should show sortable/filterable claims table
- Investigation: select any flagged claim → click Investigate → watch SSE stream

---

## Post-Phase 1 Constitution Check

*Re-checking after Phase 1 design additions.*

| Principle | Check |
|-----------|-------|
| I — Deterministic First | ✅ `InvestigationState` design keeps triage/evidence as Python functions, rationale as single LLM call |
| II — Test-First Temporal | ✅ Temporal correctness test explicitly listed as first task in feature engineering |
| III — Evidence-Gated | ✅ `halt` SSE event and `manual_review_required` status defined in contracts |
| IV — Parquet-Native | ✅ All entities map to Parquet files; no DB objects; status/anomaly enums match constitution |
| V — Minimal Viable Surface | ✅ Exactly 3 pages in structure; SSE contracts defined; error events specified |
| VI — Output Correctness | ✅ Feature manifest defined; SHAP check in RationaleResult pipeline; Pydantic schema for all outputs; state machine documented |
| VII — Investigation Completeness | ✅ `anomaly_flags` in triage output with `not_applicable`; `sources_consulted` in evidence with `unavailable` status; all investigation report fields defined in SSE `complete` event |
| Eng Quality | ✅ All schemas use Pydantic; async handlers; TypeScript strict mode in existing frontend config |

**Post-Phase 1 Constitution Check: ALL GATES PASS.**

---

## Report

**Branch**: `main`
**IMPL_PLAN**: `specs/001-claims-investigation-assistant/plan.md`

**Artifacts generated**:
- `specs/001-claims-investigation-assistant/plan.md` — this file (Technical Context, Constitution Check, Project Structure, Phase 0 Research, Phase 1 Design)
- `specs/001-claims-investigation-assistant/research.md` — to be written as separate file
- `specs/001-claims-investigation-assistant/data-model.md` — to be written as separate file
- `specs/001-claims-investigation-assistant/quickstart.md` — to be written as separate file
- `specs/001-claims-investigation-assistant/contracts/api.md` — to be written as separate file
- `specs/001-claims-investigation-assistant/contracts/sse-events.md` — to be written as separate file

**Next step**: Run `/speckit.tasks` to generate `tasks.md` with implementation task breakdown.

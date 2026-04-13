# Tasks: Claims Investigation Intelligence Assistant

**Input**: Design documents from `specs/001-claims-investigation-assistant/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅, contracts/sse-events.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Tests are included per constitution requirements (test_no_future_leakage is constitution-mandated; other tests are in Polish phase).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All tasks include exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — directory structure, configuration, and the feature manifest. No logic.

- [x] T001 Create backend project structure with pyproject.toml, all package directories, and `__init__.py` files per plan.md layout in `backend/`
- [x] T002 [P] Create data directory tree: `data/raw/`, `data/processed/`, `data/features/`, `data/scores/`, `data/ncci/`, `data/policy_docs/`, `data/chroma/`
- [x] T003 [P] Create backend environment config class and `.env.example` in `backend/app/config.py` and `backend/.env.example` (OPENAI_API_KEY, DATA_DIR, CHROMA_DIR, LLM_MODEL, RISK_THRESHOLD, LOG_LEVEL)
- [x] T004 Create feature manifest at `src/features/manifest.yml` with all 22 features: 12 claim features, 6 provider features, 4 member features per data-model.md

**Checkpoint**: Project skeleton exists; `backend/` and `data/` directories are ready; `src/features/manifest.yml` is in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. Includes data generation, ML pipeline, evidence infrastructure, and shared API/frontend scaffolding.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Data Models & API Scaffolding

- [x] T005a [P] Create core claim and risk Pydantic v2 models in `backend/app/data/schemas/claims.py`: `ClaimRecord`, `RiskScore`, `AnomalyLabel`, `Provider`, all status/band enums (`claim_status`, `anomaly_type`, `risk_band`)
- [x] T005b [P] Create investigation lifecycle Pydantic v2 models in `backend/app/data/schemas/investigation.py`: `Investigation`, `TriageResult`, `HumanDecision`, `InvestigationState` TypedDict, `investigation_status` enum
- [x] T005c [P] Create evidence and rationale Pydantic v2 models in `backend/app/data/schemas/evidence.py`: `EvidenceEnvelope`, `RationaleResult`, `PolicyCitation`, `NCCIFinding`, `DuplicateMatch`, `SourceRecord`; re-export all from `backend/app/data/schemas/__init__.py`
- [x] T006 Implement Parquet data loader in `backend/app/data/loader.py`: FastAPI lifespan context manager loading `medical_claims.parquet`, `risk_scores.parquet`, `provider_roster.parquet`, `anomaly_labels.parquet`, NCCI CSV, and in-memory investigations dict at startup
- [x] T007 Build FastAPI app entry point with lifespan, CORS middleware, global error handler, and structured logging in `backend/app/main.py`
- [x] T008 [P] Create FastAPI dependency injection providers for data store and orchestrator in `backend/app/api/dependencies.py`

### Synthetic Data Generation

- [x] T009 [P] Implement Synthea claims generation script (50K–100K records, lognormal lag) in `backend/data_generation/generate_synthea.py`
- [x] T010 [P] Implement lognormal receipt date generator (`claim_receipt_date` from `service_date`) in `backend/data_generation/generate_receipt_dates.py`
- [x] T011 Implement anomaly injection script supporting `--split train|test` with partitioned distributions (upcoding: shift CPT level; NCCI: top-50 vs next-50 pairs; duplicate: ±1d vs ±2-3d offset) in `backend/data_generation/inject_anomalies.py`
- [x] T012 [P] Create data validation script verifying anomaly distribution and Parquet schema in `backend/data_generation/validate.py`

### ML Pipeline (Feature Engineering + Model Training + Scoring)

- [x] T013 Write `test_no_future_leakage()` in `backend/tests/test_features.py` using `claim_receipt_date` strict `<` inequality — **run `pytest tests/test_features.py::test_no_future_leakage` and confirm it FAILS before writing T014** (constitution II)
- [x] T014 Implement point-in-time feature engineering in `backend/app/ml/features.py` using Polars lazy evaluation: all 22 features from manifest, per-claim lookback windows anchored to `claim_receipt_date`, never `service_date`; raises `FeatureComputationError` on missing features
- [x] T015 [P] Implement deterministic rules baseline (`ncci_conflict`, `charge_outlier`, `duplicate_match` flags) in `backend/app/ml/rules_baseline.py`
- [x] T016 Implement XGBoost model training with grouped temporal split (70/15/15 by `claim_receipt_date`, no provider in both train+test) and precision gate (≥ 0.75 at operating threshold) in `backend/app/ml/model.py`
- [x] T017 [P] Implement SHAP TreeExplainer wrapper with invariant check (`abs(sum(shap_values) - (pred - base_value)) < 1e-5`) in `backend/app/ml/explainer.py`
- [x] T018 Implement end-to-end batch scoring pipeline (features → model → SHAP → risk_band assignment) in `backend/app/ml/pipeline.py`
- [x] T019 Create model training + ablation evaluation script outputting `data/scores/model_metadata.json` in `backend/scripts/train_model.py`; add schema validation step: load the output JSON and assert all required keys are present (`auc_roc`, `precision_at_k`, `precision_recall_curve`, `per_anomaly_recall`, `ablation`) before script exits
- [x] T020 Create batch scoring script outputting `data/scores/risk_scores.parquet` in `backend/scripts/score_claims.py`; add schema validation step: load the output Parquet and assert all required columns are present (`claim_id`, `xgboost_score`, `shap_values`, `rules_flags`, `risk_band`, `scored_at`) and no nulls in `claim_id` before script exits

### Evidence Infrastructure (NCCI + RAG)

- [x] T021 Implement NCCI conflict lookup engine in `backend/app/evidence/ncci_engine.py`: load `practitioner_ptp_edits.csv` at startup, `lookup_ncci_conflict(code_1, code_2, service_date)` as sorted-tuple exact-match with date-range filtering
- [x] T022 [P] Implement CMS policy document parser and chunker (~500 tokens, 50-token overlap) in `backend/app/evidence/rag_ingest.py`
- [x] T023 [P] Implement ChromaDB embedding and single-collection indexing (`cms_policy`, `text-embedding-3-small`, metadata: source/chapter/section/topic) in `backend/app/evidence/rag_embeddings.py`
- [x] T024 Implement semantic RAG retriever with metadata-filtered search in `backend/app/evidence/rag_retriever.py`
- [x] T025 Create evidence setup script (download policy docs, ingest RAG corpus, load NCCI CSV) in `backend/scripts/setup_evidence.py`; add validation step: after ingestion, assert ChromaDB collection `cms_policy` has ≥ 1000 documents and NCCI CSV loaded ≥ 1 edit row before script exits

### SSE & Shared Frontend Infrastructure

- [x] T026 Implement SSE streaming helpers (EventSourceResponse wrapper, event emitter with required headers: `text/event-stream`, `no-cache`, `X-Accel-Buffering: no`, CORS) in `backend/app/utils/sse.py`
- [x] T027 [P] Create all shared TypeScript types in `frontend/src/lib/types.ts`: `Claim`, `RiskScore`, `Investigation`, `TriageResult`, `EvidenceEnvelope`, `RationaleResult`, `HumanDecision`, `PolicyCitation`, `NCCIFinding`, `SourceRecord`, all union string literal types — strict mode, no `any`
- [x] T028 [P] Create typed REST API client with fetch wrapper and response envelope unwrapping in `frontend/src/lib/api.ts`

**Checkpoint**: Foundation ready — data generated, model trained, evidence indexed, schemas defined, API scaffolded, frontend types in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Review Flagged Claims Dashboard (Priority: P1) 🎯 MVP

**Goal**: Dashboard and claims explorer showing prioritized flagged claims, summary KPIs, anomaly distribution, and ablation comparison. No investigation workflow required.

**Independent Test**: Open http://localhost:3000 — dashboard shows flagged claims count, anomaly type breakdown, and ablation summary. Navigate to /claims — filterable/sortable claims table loads. Filter by `risk_band=high` — only high-risk claims remain and count updates. Delivers value as a standalone claims queue viewer.

### Implementation for User Story 1

- [x] T029 [US1] Implement `GET /api/claims` route handler with pagination (`page`, `page_size`), filtering (`status`, `risk_band`, `anomaly_type`, `provider_id`, `date_from`, `date_to`), and sorting (`sort_by`, `sort_dir`) in `backend/app/api/routes/claims.py`
- [x] T030 [US1] Implement `GET /api/analytics/overview` route returning total claims, flagged count, high-risk count, anomaly distribution, rules_baseline_flagged, ml_only_flagged, combined_flagged in `backend/app/api/routes/analytics.py`
- [x] T031 [US1] Register claims and analytics routers on `/api/claims` and `/api/analytics` in `backend/app/main.py`
- [x] T032 [P] [US1] KPI summary composed inline via shadcn `Card`/`Progress`/`Badge` in `frontend/src/app/page.tsx`
- [x] T033 [P] [US1] Risk distribution composed inline via shadcn `Card` + semantic chart tokens in `frontend/src/app/page.tsx`
- [x] T034 [P] [US1] Ablation + anomaly breakdown composed inline via shadcn `Card`/`Badge`/`Separator` in `frontend/src/app/page.tsx`
- [x] T035 [P] [US1] Filterable/sortable claims table composed inline in `frontend/src/app/claims/page.tsx` using shadcn `Table`, `Select`, `ToggleGroup`, `Field`, `InputGroup`, `Empty`, `Skeleton`
- [x] T036 [US1] Dashboard page at `frontend/src/app/page.tsx` — editorial design with Instrument Serif display + Geist body; all shadcn primitives
- [x] T037 [US1] Claims explorer page at `frontend/src/app/claims/page.tsx` with filters, sort, pagination, empty state
- [x] T038 [US1] Layout at `frontend/src/app/layout.tsx` with synthetic-data banner, Sentinel nav, shadcn `TooltipProvider`/`Toaster`/`Separator`/`Badge`

**Checkpoint**: User Story 1 fully functional. Dashboard and claims explorer work independently without any investigation functionality.

---

## Phase 4: User Story 2 — Investigate a Specific Claim (Priority: P1)

**Goal**: Full streaming investigation pipeline — triage (<100ms) → evidence (<2s) → rationale streams (~5–10s) — delivered via SSE to the claim detail page.

**Independent Test**: Select any flagged claim at /claims — navigate to /claims/{id}. Click "Investigate." Triage event appears first, evidence cards populate, then rationale text streams in. Total time under 15 seconds. At least one policy citation with source/chapter/section shown. If evidence is empty, "Manual Review Required" banner appears instead of a rationale. Delivers standalone value as an investigation-support tool.

### Implementation for User Story 2

- [x] T039 [US2] Define `InvestigationState` TypedDict and LangGraph graph skeleton with three node slots and edge routing in `backend/app/orchestrator/graph.py`
- [x] T040 [US2] Implement deterministic triage node: classify anomaly type from `rules_flags` + `xgboost_score`, set all 3 `anomaly_flags` (detected/not_applicable/insufficient_data), select evidence tools, set priority in `backend/app/orchestrator/triage.py`
- [x] T041 [US2] Define four evidence tool functions (`ncci_lookup`, `rag_retrieval`, `provider_history`, `duplicate_search`) as callable wrappers in `backend/app/orchestrator/tools.py`
- [x] T042 [US2] Implement deterministic evidence node: execute all selected tools, record all 4 sources in `sources_consulted`, check empty-evidence gate (all unavailable → `manual_review_required` halt) in `backend/app/orchestrator/evidence.py`
- [x] T043 [US2] Write rationale synthesis prompt with all evidence pre-assembled, JSON output schema, and instructions to address all 3 anomaly flags in `backend/app/orchestrator/prompts/rationale.md`
- [x] T044 [US2] Implement LLM rationale node: single `gpt-4o` call with streaming, Pydantic `RationaleResult` validation, SHAP invariant pre-check in `backend/app/orchestrator/rationale.py`
- [x] T045 [US2] Wire complete LangGraph graph (triage → evidence → rationale, halt edge from evidence when empty, error edge on exceptions) in `backend/app/orchestrator/graph.py`
- [x] T046 [US2] Implement `POST /api/claims/{claim_id}/investigate` SSE endpoint emitting `triage`, `evidence`, `rationale_chunk` (multiple), `complete`/`halt`/`error` events with required headers in `backend/app/api/routes/investigation.py`
- [x] T047 [US2] Implement `GET /api/claims/{claim_id}` returning full claim, risk score with SHAP values, and investigation (null if not yet run) in `backend/app/api/routes/claims.py`
- [x] T048 [US2] Implement `GET /api/claims/{claim_id}/investigation` (stored result) and `GET /api/claims/{claim_id}/investigation/status` (polling fallback) in `backend/app/api/routes/investigation.py`
- [x] T049 [US2] Implement `GET /api/ncci/{code_1}/{code_2}` endpoint with `service_date` query param in `backend/app/api/routes/ncci.py`
- [x] T050 [US2] Register investigation and NCCI routers in `backend/app/main.py`
- [x] T051 [US2] Implement typed `EventSource` SSE client wrapper with discriminated union event types (`TriageEvent`, `EvidenceEvent`, `RationaleChunkEvent`, `CompleteEvent`, `HaltEvent`, `ErrorEvent`) in `frontend/src/lib/sse.ts`
- [x] T052 [P] [US2] Create risk score panel with numeric gauge and SHAP waterfall chart (top contributing features) in `frontend/src/components/investigation/RiskPanel.tsx`
- [x] T053 [P] [US2] Create evidence cards displaying policy citations (source/chapter/section), NCCI findings, provider context, and sources-consulted status list in `frontend/src/components/investigation/EvidenceCards.tsx`
- [x] T054 [P] [US2] Create streaming rationale display with progressive text render, confidence level, recommended action, and "Manual Review Required" halt state in `frontend/src/components/investigation/RationaleStream.tsx`
- [x] T055 [US2] Implement claim detail page in `frontend/src/app/claims/[id]/page.tsx`: display all claim fields (claim_id, member_id, provider_id, service_date, claim_receipt_date, procedure_codes, diagnosis_codes, modifiers, charge_amount, allowed_amount, paid_amount, place_of_service, claim_status, anomaly_type); render risk panel; show full anomaly_flags dict from TriageResult with detected/not_applicable/insufficient_data badges for all 3 types (not only the primary); when `investigation === null` show "Investigate" button triggering SSE stream; when `investigation !== null` show the stored result (rationale panel, evidence cards) alongside a "Re-investigate" button that triggers a new SSE stream and replaces the previous result; sequential rendering of triage → evidence → rationale; error/halt handling
- [x] T056a [US2] Implement investigation persistence write path in `backend/app/data/loader.py`: add `save_investigation(investigation: Investigation)` that serializes the in-memory investigations dict to `data/scores/investigations.parquet`; call it from the investigation SSE endpoint (T046) on `complete`/`halt`/`error` events; add assertion in `backend/tests/test_api.py` that an investigation survives a simulated restart (write → reload → verify result intact)

**Checkpoint**: Full investigation pipeline functional. SSE streaming works end-to-end. Empty-evidence halt renders correctly. Error events display without broken UI. **Investigation results persist across restarts (FR-011) — this checkpoint must not be signed off until T056a is complete.**

---

## Phase 5: User Story 3 — Provide Investigation Feedback (Priority: P2)

**Goal**: Record investigator decision (accept/reject/escalate) after reviewing AI rationale. Display AI-generated vs human-confirmed labels. Claim status updates to reflect decision.

**Independent Test**: Complete an investigation on any claim. Click "Accept." Verify the decision is saved (GET investigation returns human_decision with timestamp). Navigate to /claims — the claim's status shows "accepted" instead of "pending_review." UI clearly distinguishes the AI rationale from the human decision using visible labeling.

### Implementation for User Story 3

- [ ] T056 [US3] Implement `PATCH /api/claims/{claim_id}/investigation` route accepting `{decision, notes?}`, validating state machine transition (`pending_review` → accepted/rejected/escalated), updating claim status and investigation in-memory store, and calling `save_investigation()` (T056a) on decision write in `backend/app/api/routes/investigation.py`
- [ ] T057 [US3] Implement claim status transition enforcement in `backend/app/data/loader.py`: validate allowed transitions per state machine, raise domain error on invalid transitions
- [ ] T058 [P] [US3] Create investigator feedback form component with Accept/Reject/Escalate buttons, optional notes textarea, and submit handler in `frontend/src/components/investigation/FeedbackForm.tsx`
- [ ] T059 [US3] Integrate feedback form and AI-vs-human labeling into the claim detail page: show feedback form below rationale when investigation is complete and no decision recorded; show recorded decision with "Human Confirmed" label when decision exists in `frontend/src/app/claims/[id]/page.tsx`
- [ ] T060 [US3] Update claims table status column to reflect post-decision states (accepted/rejected/escalated) with distinct status badge styles in `frontend/src/components/claims/ClaimsTable.tsx`

**Checkpoint**: Full investigation loop demonstrable — queue review → investigation → decision. All three investigator workflows (FR-003, FR-004, FR-007) functional.

---

## Phase 6: User Story 4 — Review Model Performance & Ablation (Priority: P3)

**Goal**: Analytics section displaying AUC-ROC, precision-recall curve, precision@K, per-anomaly-type recall, and ablation comparison table — all explicitly labeled as synthetic-data results.

**Independent Test**: View the analytics/model performance section (accessible from dashboard). Confirm AUC-ROC score, precision-recall curve chart, and ablation table (rules-only / XGBoost-only / combined) are displayed. Confirm "Synthetic Data" label is visible on all metrics.

### Implementation for User Story 4

- [ ] T061 [US4] Implement `GET /api/analytics/model-performance` route loading metrics from `data/scores/model_metadata.json` (auc_roc, precision_at_k, precision_recall_curve, per_anomaly_recall, ablation comparison) with `data_framing: "synthetic"` in `backend/app/api/routes/analytics.py`
- [ ] T062 [US4] Register model-performance route in `backend/app/main.py`
- [ ] T063 [P] [US4] Create model metrics cards component (AUC-ROC, precision@K) with explicit "Synthetic Data" label in `frontend/src/components/dashboard/ModelMetricsCard.tsx`
- [ ] T064 [P] [US4] Create precision-recall curve chart component using Recharts in `frontend/src/components/charts/PrecisionRecallChart.tsx`
- [ ] T065 [P] [US4] Create ablation comparison table (rules-only / XGBoost-only / combined, each with precision/recall/F1) in `frontend/src/components/dashboard/AblationTable.tsx`
- [ ] T065a [P] [US4] Create per-anomaly-type recall breakdown card in `frontend/src/components/dashboard/PerAnomalyRecallCard.tsx` displaying recall % for upcoding, NCCI violations, and duplicate billing separately
- [ ] T066 [US4] Add model performance section (metrics cards + precision-recall chart + per-anomaly recall card + ablation table) to dashboard page in `frontend/src/app/page.tsx`

**Checkpoint**: All four user stories functional and independently testable. Full end-to-end demo ready.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Test coverage, validation, and constitution compliance checks across all stories.

- [ ] T067 [P] Write NCCI engine fixture tests (≥1 fixture per category: unbundling, bilateral, assistant-at-surgery; test date range boundaries) in `backend/tests/test_ncci_engine.py`
- [ ] T068 [P] Write RAG retriever tests (precision@5 ≥ 80% on ≥10 Medicare Part B questions) in `backend/tests/test_retriever.py`
- [ ] T069 Write orchestrator integration tests: triage routing for all 3 anomaly types, halt condition when all evidence unavailable, error event on exception — LLM mocked in all tests in `backend/tests/test_orchestrator.py`
- [ ] T070 [P] Write XGBoost model test: assert precision ≥ 0.75 at operating threshold on holdout set in `backend/tests/test_model.py`
- [ ] T071 [P] Write rules baseline ablation tests in `backend/tests/test_rules_baseline.py`
- [ ] T072 [P] Write API endpoint tests for all routes (claims list, claim detail, investigation CRUD, analytics, NCCI lookup) in `backend/tests/test_api.py`
- [ ] T072a [P] Write pipeline latency test in `backend/tests/test_performance.py`: trigger investigation on a representative flagged claim, assert total elapsed time < 15s, assert triage SSE event arrives < 100ms after trigger, assert evidence event arrives < 2s after triage — LLM mocked to isolate pipeline latency from LLM variability
- [ ] T073 Verify ≥80% line coverage on `backend/app/ml/`, `backend/app/orchestrator/`, `backend/app/api/` via `pytest --cov=app --cov-report=term-missing`
- [ ] T074 Run complete end-to-end quickstart validation per `quickstart.md` steps 1–8 and confirm all 4 verification scenarios pass
- [ ] T075 [P] Implement and run rationale prompt schema validation: implement `backend/scripts/validate_prompt.py` that loads 50 representative flagged claims from Parquet, runs the rationale node (real LLM, real ChromaDB), and for each output asserts `RationaleResult` Pydantic schema validates, `policy_citations` is non-empty, all 3 `anomaly_flags_addressed` keys are present, and `recommended_action` is non-null; gate: ≥90% of outputs must pass all assertions before T044 is considered shippable (constitution R-007, plan.md)
- [ ] T075a [P] Evaluate rationale quality against SC-003: first create `specs/001-claims-investigation-assistant/rubric.md` defining the evaluation rubric — "useful" (correct anomaly type, ≥1 valid policy citation, recommended action is actionable), "partially useful" (correct anomaly type, weak/absent citations), "not useful" (wrong anomaly type or hallucinated citations); then apply the rubric to all 50-claim outputs from T075 and record results in `data/scores/rationale_eval_results.json`; gate: ≥85% rated "useful" before Phase 7 checkpoint is signed off (spec.md SC-003)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
  - T005a, T005b, T005c are all parallel (different schema files); T006 depends on all three
  - T013 (`test_no_future_leakage`) must be written and FAILING before T014 (feature engineering)
  - T009–T012 (data generation) must run before T014–T020 (ML pipeline)
  - T021–T025 (evidence infrastructure) can run in parallel with ML pipeline
- **User Stories (Phase 3–6)**: All depend on Phase 2 completion
  - US1 and US2 are both P1 — can be worked in parallel by separate developers after Phase 2
  - US3 depends on US2 (investigation must exist before feedback can be submitted)
  - US4 is independent of US2/US3 — shares only the analytics route from US1
- **Polish (Phase 7)**: After all desired user stories are complete
  - T075 depends on T043 (prompt) and T044 (rationale node) being complete — must run before Phase 7 checkpoint
  - T075a depends on T075 (needs the 50-claim output) — can be done immediately after T075
  - T056a (persistence write path) must be complete before T072 (API tests assert restart survival)

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependency on other stories
- **US2 (P1)**: Can start after Phase 2 — no dependency on US1 (separate routes and pages)
- **US3 (P2)**: Requires US2 (needs an investigation to submit feedback against)
- **US4 (P3)**: Requires US1 route (extends `/api/analytics/overview` route file) but otherwise independent

### Within Each User Story

- Backend routes before frontend pages (frontend depends on API contract)
- Models/tools before services/nodes before routes
- Each story complete and tested before moving to next priority

### Parallel Opportunities

- T002, T003 can run in parallel (different directories)
- T005a, T005b, T005c can run in parallel (different schema files)
- T009, T010, T012 can run in parallel (independent scripts)
- T015, T017 can run in parallel (different ML files)
- T022, T023, T024 can run in parallel (different evidence files)
- T027, T028 can run in parallel (different frontend lib files)
- T032, T033, T034, T035 can run in parallel (different component files, US1)
- T052, T053, T054 can run in parallel (different investigation components, US2)
- T058 can run in parallel with T057 (different files, US3)
- T063, T064, T065, T065a can run in parallel (different analytics components, US4)
- T067, T068, T070, T071, T072, T072a can all run in parallel (different test files)
- T075 and T075a must run sequentially (T075a depends on T075 output); both can run in parallel with T067–T072a
- T075 and T075a must run sequentially (T075a depends on T075 output); both can run in parallel with T067–T072a

---

## Parallel Execution Examples

### Parallel Example: Phase 2 Schema Split

```
Simultaneously (all different files):
  Task T005a: backend/app/data/schemas/claims.py
  Task T005b: backend/app/data/schemas/investigation.py
  Task T005c: backend/app/data/schemas/evidence.py + __init__.py
Then sequentially:
  Task T006: loader.py — imports from schemas package (depends on T005a, T005b, T005c)
```

### Parallel Example: Phase 2 Evidence Infrastructure

```
Simultaneously:
  Task T022: Implement RAG document parser in backend/app/evidence/rag_ingest.py
  Task T023: Implement ChromaDB indexing in backend/app/evidence/rag_embeddings.py
  Task T021: Implement NCCI conflict engine in backend/app/evidence/ncci_engine.py
Then sequentially:
  Task T024: Implement RAG retriever (depends on T022, T023)
  Task T025: Create setup_evidence.py script (depends on T021, T024)
```

### Parallel Example: User Story 1 Frontend

```
Simultaneously (all different files):
  Task T032: KpiCards.tsx
  Task T033: RiskDistributionChart.tsx
  Task T034: AblationCard.tsx
  Task T035: ClaimsTable.tsx
Then sequentially:
  Task T036: page.tsx (Dashboard) — composes T032, T033, T034
  Task T037: claims/page.tsx — uses T035
```

### Parallel Example: User Story 2 Frontend

```
Simultaneously:
  Task T052: RiskPanel.tsx (risk gauge + SHAP waterfall)
  Task T053: EvidenceCards.tsx
  Task T054: RationaleStream.tsx
Then:
  Task T055: claims/[id]/page.tsx — composes all three
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **generate data, train model, index evidence**
3. Complete Phase 3: User Story 1 → validate dashboard independently
4. Complete Phase 4: User Story 2 → validate SSE investigation independently
5. **STOP and DEMO**: Both P1 stories functional → full capability demonstration possible
6. Continue with US3, US4 as P2/P3 additions

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 → Claims queue viewer functional (standalone demo-able)
3. US2 → Investigation pipeline functional (core value prop delivered)
4. US3 → Human-in-the-loop loop closed (accountability layer added)
5. US4 → Model performance transparent (evaluation narrative complete)

### Parallel Team Strategy

After Phase 2 completes:

- **Developer A**: User Story 1 (dashboard + claims explorer)
- **Developer B**: User Story 2 (orchestrator + SSE + claim detail)
- **Developer C**: User Story 4 (analytics routes + performance charts)

US3 integrates after US2 completes (small surface area — one PATCH route + 2 frontend components).

---

## Notes

- `[P]` tasks operate on different files with no incomplete dependencies — safe to run in parallel
- `[US#]` label maps each task to a specific user story for traceability
- **T005a/b/c split**: schemas are a package at `backend/app/data/schemas/` (not a single file); T006 imports from the package after all three complete
- **T013 is a hard gate**: `test_no_future_leakage` must be written and FAILING before T014 (constitution II)
- Each user story is independently completable and testable
- SHAP invariant check in T017/T044 must use `TreeExplainer` only — `Explainer` is not acceptable (constitution)
- LLM must be mocked in all orchestrator tests (T069) — real Parquet fixtures are NOT mocked (constitution)
- Investigation in-memory store persists to `data/scores/investigations.parquet` on write via T056a (Phase 4) — T046 calls `save_investigation()` on complete/halt/error; T056 calls it on decision write
- **T056a is a hard gate for FR-011**: lives in Phase 4 alongside T046; Phase 4 checkpoint must not be signed off until T056a is complete; T072 API tests include restart-survival assertion
- **T075 is a hard gate for production inference**: rationale prompt must pass ≥90% schema-correctness on 50 claims before T044 is considered shippable (R-007, plan.md)
- **T075a is a hard gate for SC-003**: ≥85% "useful" rating on 50-claim sample required before Phase 7 checkpoint is signed off
- Investigation in-memory store persists to `data/scores/investigations.parquet` on write via T056a (Phase 4) — T046 calls `save_investigation()` on complete/halt/error; T056 calls it on decision write
- **T056a is a hard gate for FR-011**: lives in Phase 4 alongside T046; Phase 4 checkpoint must not be signed off until T056a is complete; T072 API tests include restart-survival assertion
- **T075 is a hard gate for production inference**: rationale prompt must pass ≥90% schema-correctness on 50 claims before T044 is considered shippable (R-007, plan.md)
- **T075a is a hard gate for SC-003**: ≥85% "useful" rating on 50-claim sample required before Phase 7 checkpoint is signed off
- Exactly 3 frontend pages: `/`, `/claims`, `/claims/[id]` — no additions (constitution V)
- All 4 SSE response headers required or browser-side failures occur silently (constitution V, sse-events.md)

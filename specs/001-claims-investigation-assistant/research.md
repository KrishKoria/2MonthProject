# Research: Claims Investigation Intelligence Assistant

**Phase 0 Output** | Branch: `main` | Date: 2026-04-11

---

## R-001: LangGraph State Schema Design

**Decision**: Single `InvestigationState` TypedDict as LangGraph state. All nodes read/write to shared state.

**Rationale**: LangGraph's canonical pattern for linear pipelines is a single typed state. Three nodes in a linear chain (triage → evidence → rationale) have no need for per-node isolated state. TypedDict + Pydantic at boundaries gives constitution VI output correctness without overengineering.

**Alternatives considered**: Separate state per node (rejected — unnecessary complexity); LangChain agents with tool use (rejected — contradicts constitution I, multi-LLM calls); untyped dict state (rejected — constitution requires Pydantic models).

---

## R-002: SSE Streaming Architecture

**Decision**: `sse-starlette` library for FastAPI SSE. Investigation endpoint returns `EventSourceResponse`. Events emitted in order: `triage`, `evidence`, `rationale_chunk` (multiple), `complete`, `halt`, `error`.

**Rationale**: `sse-starlette` is the de facto standard for SSE in FastAPI. Required headers per constitution V: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, CORS.

**Fallback (designed-in, not pre-built)**: Polling `GET /api/claims/{id}/investigation/status` every 500ms. Backend stores intermediate state. UX nearly identical from demo audience view.

**Alternatives considered**: WebSockets (overkill for unidirectional stream); long polling (less clean).

---

## R-003: Point-in-Time Feature Engineering Strategy

**Decision**: Per-claim temporal join using `claim_receipt_date` with strict `<` inequality. Polars lazy evaluation preferred for provider/member aggregations — prevents compute-then-join by construction.

**Critical bugs to prevent**:
1. Off-by-one: use `<` not `<=` for lookback upper bound
2. Compute-then-join: never aggregate over full dataset then join
3. Wrong date column: always `claim_receipt_date`, never `service_date`

**Test-first requirement**: `tests/test_features.py::test_no_future_leakage` must be written FIRST and confirmed FAILING before any feature engineering code is committed (constitution II).

**Alternatives considered**: Pandas `merge_asof` (viable but error-prone inequality handling); pre-aggregated tables (leakage risk); PySpark (out of scope for local prototype).

---

## R-004: ChromaDB Collection Design

**Decision**: Single collection `cms_policy`. Metadata: `source`, `chapter`, `section`, `topic` (enum: `billing`, `fraud`, `coding`, `ncci_background`). Chunk: ~500 tokens, 50-token overlap. Embedding: `text-embedding-3-small`.

**Corpus**: CMS Medicare Claims Processing Manual (Ch. 12, 23, 26), HCPCS Code Descriptions, CMS Fraud/Waste/Abuse Guidelines.

**Golden eval set**: ~50 question-answer pairs. Precision@5 target: >80% (constitution III, SC-002).

**Alternatives considered**: Per-document collections (harder cross-source search); Weaviate/Pinecone (operational overhead unjustified); BM25 hybrid search (add only if semantic retrieval falls below target).

---

## R-005: XGBoost Training and Evaluation Pipeline

**Decision**: Grouped temporal split — sort by `claim_receipt_date`, 70/15/15. Group constraint: no `provider_id` in both train and test. Different anomaly injection parameter distributions per split (per design spec 2.2).

**Promotion gate**: Precision at operating threshold >= 0.75 (constitution VI). Gate fails = do not promote.

**SHAP check**: `abs(sum(shap_values) - (pred - base_value)) < 1e-5` for all predictions. Failing assertions block rationale node.

**Alternatives considered**: Random split (temporal leakage); stratified by anomaly type only (misses provider leakage); LightGBM (comparable performance; XGBoost chosen for TreeExplainer exact attributions).

---

## R-006: NCCI Rules Engine Implementation

**Decision**: Pandas DataFrame lookup at startup. `lookup_ncci_conflict(code_1, code_2, service_date)` as exact-match: normalize code pair (sorted tuple), filter by date range.

**Return schema**: `{ conflict_exists: bool, edit_type: str | null, effective_date: str | null, rationale: str | null }`

**Test fixtures**: At least one fixture per code-pair category (unbundling, bilateral, assistant-at-surgery) in `tests/test_ncci_engine.py` (constitution VI).

**V2 extension point**: `modifier_indicator` field in CSV; modifier bypass logic deferred.

**Alternatives considered**: SQLite (rejected per constitution IV deferral register); RAG over NCCI edits (wrong tool — structured rules need structured lookup); in-memory dict (considered for O(1) lookup; Pandas chosen for date-range filtering).

---

## R-007: Rationale Prompt Design

**Decision**: Single structured prompt with all evidence pre-assembled. Strict JSON output schema enforced via Pydantic. LLM: OpenAI `gpt-4o` primary, Anthropic `claude-sonnet-4-6` secondary.

**Output schema** (Pydantic `RationaleResult`):
- `summary: str`
- `supporting_evidence: list[str]`
- `policy_citations: list[PolicyCitation]`
- `anomaly_flags_addressed: dict[str, str | None]` — all 3 types required
- `recommended_action: str`
- `confidence: float` (0.0–1.0)
- `review_needed: bool`

**Validation gate**: Validated against >=50 sample claims before production path activated. Target: >85% acceptable (constitution III).

**Alternatives considered**: Multi-step LLM chain (deferred per constitution deferral register); function calling for citations (adds complexity without benefit when evidence is pre-gathered); local LLM (latency too high for <15s target).

---

## R-008: Anomaly Injection Distribution Partitioning

**Decision**: Separate injection parameters for train vs. test data.

| Anomaly Type | Train | Test (Holdout) |
|---|---|---|
| Upcoding | Shift 1 CPT level within category | Shift 2 levels or cross-category |
| NCCI Violations | Top 50 conflicting code pairs | Next 50 pairs (structurally similar) |
| Duplicate Billing | Clone ±1 day offset | Clone ±2-3 day, different modifiers |

**Rationale**: Measures generalization to unseen anomaly variants, not memorization of injection function.

---

## R-009: Parquet Load-at-Startup Pattern

**Decision**: FastAPI `lifespan` context manager loads all Parquet files into memory at startup. FastAPI dependency injection provides the data store to route handlers.

**Memory estimate**: 100K claims x ~30 columns x ~8 bytes = ~24MB. Well within server RAM.

**Rationale**: Constitution IV — no runtime I/O in request handlers.

**Alternatives considered**: Load on first request (violates constitution IV); DuckDB memory-mapped (viable but adds dependency).

---

## R-010: Frontend SSE Client

**Decision**: Native browser `EventSource` API (no library). `lib/sse.ts` as a typed wrapper with discriminated union event types: `TriageEvent`, `EvidenceEvent`, `RationaleChunkEvent`, `CompleteEvent`, `HaltEvent`, `ErrorEvent`.

**Alternatives considered**: `eventsource` npm library (unnecessary; native API has full browser support); polling (fallback only).

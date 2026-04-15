# Architecture

**Analysis Date:** 2026-04-15

## Pattern Overview

**Overall:** Dual-application monorepo with a server-rendered Next.js workbench in `frontend/` and a FastAPI analytics/orchestration service in `backend/`, both operating against repo-level synthetic artifacts in `data/`.

**Key Characteristics:**
- Use server-rendered route handlers in `frontend/src/app/` for initial data fetches, then hand off claim-queue filters and investigation streaming to client components in `frontend/src/components/`.
- Load claim, roster, score, NCCI, and persisted investigation artifacts into one in-memory `DataStore` during FastAPI lifespan startup in `backend/app/data/loader.py`; request handlers read that store instead of hitting a database.
- Keep investigation execution deterministic until the final rationale step: `backend/app/orchestrator/triage.py` and `backend/app/orchestrator/evidence.py` run local logic first, and `backend/app/orchestrator/rationale.py` is the only OpenAI-backed stage.

## Layers

**Frontend App Router layer:**
- Purpose: Define page entry points and fetch initial page data on the server.
- Location: `frontend/src/app/`
- Contains: `layout.tsx`, dashboard page in `frontend/src/app/page.tsx`, queue page in `frontend/src/app/claims/page.tsx`, detail page in `frontend/src/app/claims/[id]/page.tsx`, and global CSS in `frontend/src/app/globals.css`.
- Depends on: `frontend/src/lib/api.ts`, `frontend/src/lib/server-api.ts`, `frontend/src/lib/types.ts`, and feature components under `frontend/src/components/`.
- Used by: Next.js runtime configured in `frontend/next.config.ts`.

**Frontend interaction and contract layer:**
- Purpose: Isolate browser behavior, URL/query translation, typed REST helpers, and typed SSE parsing from page files.
- Location: `frontend/src/lib/`
- Contains: REST client in `frontend/src/lib/api.ts`, server-side base URL resolution in `frontend/src/lib/server-api.ts`, queue query encoding in `frontend/src/lib/claims-query.ts`, SSE parser in `frontend/src/lib/sse.ts`, UI copy in `frontend/src/lib/experience-copy.ts`, and mirrored backend contracts in `frontend/src/lib/types.ts`.
- Depends on: `fetch`, Next.js request headers via `frontend/src/lib/server-api.ts`, and the backend API/SSE contracts documented in `specs/001-claims-investigation-assistant/contracts/`.
- Used by: Server route files in `frontend/src/app/` and client components such as `frontend/src/components/claims/ClaimsExplorer.tsx` and `frontend/src/components/investigation/InvestigationConsole.tsx`.

**Backend API layer:**
- Purpose: Expose HTTP and SSE endpoints and translate in-memory backend state into API envelopes.
- Location: `backend/app/main.py`, `backend/app/api/dependencies.py`, `backend/app/api/routes/`
- Contains: App bootstrap and middleware in `backend/app/main.py`, dependency providers in `backend/app/api/dependencies.py`, claim routes in `backend/app/api/routes/claims.py`, analytics routes in `backend/app/api/routes/analytics.py`, investigation routes in `backend/app/api/routes/investigation.py`, and direct NCCI lookup in `backend/app/api/routes/ncci.py`.
- Depends on: `DataStore` from `backend/app/data/loader.py`, schemas from `backend/app/data/schemas/`, orchestration modules in `backend/app/orchestrator/`, and utilities in `backend/app/utils/`.
- Used by: The Next.js frontend through `/api/...` rewrites from `frontend/next.config.ts` and by direct backend consumers.

**Backend data/state layer:**
- Purpose: Centralize startup data loading, persisted investigation writes, and backend schema definitions.
- Location: `backend/app/data/`
- Contains: In-memory store and lifespan logic in `backend/app/data/loader.py`; claim, evidence, and investigation models in `backend/app/data/schemas/claims.py`, `backend/app/data/schemas/evidence.py`, and `backend/app/data/schemas/investigation.py`.
- Depends on: `backend/app/config.py` and repo-level artifacts under `data/processed/`, `data/scores/`, and `data/ncci/`.
- Used by: Every backend route and orchestration module via dependency injection or direct imports.

**Backend investigation orchestration layer:**
- Purpose: Define the claim investigation workflow and its state transitions.
- Location: `backend/app/orchestrator/`
- Contains: Triaging in `backend/app/orchestrator/triage.py`, evidence aggregation in `backend/app/orchestrator/evidence.py`, tool wrappers in `backend/app/orchestrator/tools.py`, LLM rationale streaming in `backend/app/orchestrator/rationale.py`, graph definition in `backend/app/orchestrator/graph.py`, and prompt template in `backend/app/orchestrator/prompts/rationale.md`.
- Depends on: `DataStore`, evidence helpers, shared schemas, and `backend/app/config.py`.
- Used by: `backend/app/api/routes/investigation.py`; `backend/app/orchestrator/graph.py` also serves as the canonical non-streaming graph definition for tests and alternate invocation paths.

**Evidence and rule lookup layer:**
- Purpose: Provide deterministic helpers for coding-rule checks and policy retrieval.
- Location: `backend/app/evidence/`
- Contains: NCCI CSV engine in `backend/app/evidence/ncci_engine.py`, RAG chunk ingestion in `backend/app/evidence/rag_ingest.py`, Chroma indexing in `backend/app/evidence/rag_embeddings.py`, and semantic retrieval in `backend/app/evidence/rag_retriever.py`.
- Depends on: Repo-level `data/ncci/`, `data/policy_docs/`, `data/chroma/`, and settings in `backend/app/config.py`.
- Used by: `backend/app/orchestrator/tools.py` and maintenance scripts in `backend/scripts/`.

**ML and scoring layer:**
- Purpose: Define feature engineering, deterministic rules, model inference, and batch scoring artifacts.
- Location: `backend/app/ml/` and `src/features/manifest.yml`
- Contains: Feature computation in `backend/app/ml/features.py`, rules baseline in `backend/app/ml/rules_baseline.py`, model training/inference in `backend/app/ml/model.py`, SHAP explanations in `backend/app/ml/explainer.py`, and score materialization in `backend/app/ml/pipeline.py`.
- Depends on: Claims artifacts under `data/`, NCCI lookups from `backend/app/evidence/ncci_engine.py`, and the manifest in `src/features/manifest.yml`.
- Used by: Offline scripts in `backend/scripts/`; API routes only read the resulting scored outputs from `data/scores/`.

**Offline asset generation layer:**
- Purpose: Rebuild synthetic data, evidence corpus, model artifacts, and scores outside request handling.
- Location: `backend/data_generation/` and `backend/scripts/`
- Contains: Synthetic data generation utilities in `backend/data_generation/*.py` and operational scripts such as `backend/scripts/setup_evidence.py`, `backend/scripts/train_model.py`, and `backend/scripts/score_claims.py`.
- Depends on: Backend ML/evidence modules and repo-level `data/`.
- Used by: Developers refreshing artifacts; not used directly by the running frontend.

## Data Flow

**Dashboard and queue read flow:**

1. `frontend/src/app/page.tsx` and `frontend/src/app/claims/page.tsx` resolve a backend origin with `frontend/src/lib/server-api.ts`.
2. Those route files call the typed client in `frontend/src/lib/api.ts`.
3. Next.js rewrites `/api/:path*` to the backend origin in `frontend/next.config.ts` when no explicit browser base URL is configured.
4. FastAPI routes in `backend/app/api/routes/analytics.py` and `backend/app/api/routes/claims.py` read from `DataStore`.
5. The backend wraps payloads in `{ data, metadata }` envelopes and returns them to the frontend, which unwraps them in `frontend/src/lib/api.ts`.

**Claim investigation stream flow:**

1. `frontend/src/app/claims/[id]/page.tsx` fetches the current claim and any persisted investigation through `api.getClaim`.
2. `frontend/src/components/investigation/InvestigationConsole.tsx` starts review by calling `streamInvestigation` from `frontend/src/lib/sse.ts`.
3. `frontend/src/lib/sse.ts` issues `POST /api/claims/{claim_id}/investigate` and parses raw SSE frames from the streamed response body.
4. `backend/app/api/routes/investigation.py` builds initial state from `DataStore`, runs `run_triage`, then `run_evidence`, then conditionally `stream_rationale`.
5. `backend/app/orchestrator/triage.py` computes anomaly flags and priority, `backend/app/orchestrator/evidence.py` gathers all four evidence sources, and `backend/app/orchestrator/rationale.py` streams JSON chunks from OpenAI only if evidence was sufficient.
6. `backend/app/api/routes/investigation.py` persists the final `Investigation` to `data/scores/investigations.parquet` through `DataStore.save_investigation`, and the frontend updates local UI state as `triage`, `evidence`, `rationale_chunk`, `complete`, `halt`, or `error` events arrive.

**Offline scoring flow:**

1. `backend/scripts/train_model.py` and `backend/scripts/score_claims.py` run feature engineering and model scoring through modules in `backend/app/ml/`.
2. The feature manifest in `src/features/manifest.yml` and functions in `backend/app/ml/features.py` define the score inputs.
3. `backend/app/ml/pipeline.py` writes risk bands, SHAP values, and rules flags into `data/scores/risk_scores.parquet`.
4. The runtime API only reads those prepared artifacts via `backend/app/data/loader.py`.

**State Management:**
- Treat the queue URL as the source of truth for list filters and sorting in `frontend/src/lib/claims-query.ts` and `frontend/src/components/claims/ClaimsExplorer.tsx`.
- Keep page-level data fetching on the server in `frontend/src/app/`, but move transient review state into client components such as `frontend/src/components/investigation/InvestigationConsole.tsx` and `frontend/src/components/investigation/HumanReviewDesk.tsx`.
- Keep backend runtime state in one startup-loaded `DataStore` instance from `backend/app/data/loader.py`; persist only investigations back to `data/scores/investigations.parquet`.

## Key Abstractions

**`DataStore`:**
- Purpose: Represent the runtime backend state as loaded DataFrames plus persisted investigations.
- Examples: `backend/app/data/loader.py`, `backend/app/api/dependencies.py`
- Pattern: Lifespan-loaded singleton-like state injected through FastAPI request dependencies.

**API envelope contract:**
- Purpose: Standardize all backend responses behind `{ data, metadata }` and centralize error handling.
- Examples: `backend/app/api/routes/claims.py`, `backend/app/api/routes/analytics.py`, `frontend/src/lib/api.ts`, `specs/001-claims-investigation-assistant/contracts/api.md`
- Pattern: Backend route-local `_envelope` helpers plus a frontend unwrapping client.

**`InvestigationState`:**
- Purpose: Define the orchestration state that moves between triage, evidence, and rationale steps.
- Examples: `backend/app/data/schemas/investigation.py`, `backend/app/orchestrator/graph.py`
- Pattern: TypedDict-based state graph plus direct node invocation from the streaming route.

**Evidence envelope and source records:**
- Purpose: Keep evidence results complete even when some sources are unavailable.
- Examples: `backend/app/data/schemas/evidence.py`, `backend/app/orchestrator/evidence.py`, `backend/app/orchestrator/tools.py`
- Pattern: Aggregate object with per-source status records rather than optional ad hoc fields.

**Mirrored frontend types:**
- Purpose: Keep TypeScript rendering code aligned with backend Pydantic schemas without importing Python code.
- Examples: `frontend/src/lib/types.ts`, `backend/app/data/schemas/claims.py`, `backend/app/data/schemas/evidence.py`, `backend/app/data/schemas/investigation.py`
- Pattern: Manual contract mirroring backed by spec docs under `specs/001-claims-investigation-assistant/contracts/`.

## Entry Points

**Backend runtime entry point:**
- Location: `backend/app/main.py`
- Triggers: `uv run app/main.py` or `uv run uvicorn app.main:app --reload`
- Responsibilities: Create the FastAPI app, attach CORS and timing middleware, load lifespan state, register route modules, and start uvicorn when executed directly.

**Frontend runtime entry point:**
- Location: `frontend/src/app/layout.tsx`
- Triggers: Next.js App Router startup from `bun run dev`, `bun run build`, or `next start`
- Responsibilities: Establish global shell chrome, top-level navigation, tooltip/toast providers, and shared page framing.

**Dashboard page entry point:**
- Location: `frontend/src/app/page.tsx`
- Triggers: Route `/`
- Responsibilities: Fetch analytics and model-performance payloads and compose dashboard cards/charts.

**Queue page entry point:**
- Location: `frontend/src/app/claims/page.tsx`
- Triggers: Route `/claims`
- Responsibilities: Convert `searchParams` into a canonical `ClaimsQuery`, fetch paginated rows, and mount `ClaimsExplorer`.

**Claim detail entry point:**
- Location: `frontend/src/app/claims/[id]/page.tsx`
- Triggers: Route `/claims/[id]`
- Responsibilities: Fetch one claim, render fact and risk panels, and mount `InvestigationConsole`.

**Offline asset entry points:**
- Location: `backend/scripts/*.py`, `backend/data_generation/*.py`
- Triggers: Manual developer runs
- Responsibilities: Refresh source data, vector indexes, models, and scored outputs that the runtime later consumes.

## Error Handling

**Strategy:** Fail at the boundary, return machine-readable payloads, and keep the streaming path explicit about halts and errors.

**Patterns:**
- Use FastAPI exception handlers in `backend/app/main.py` for `ValueError` and uncaught exceptions.
- Raise `HTTPException` for route-local missing-resource or conflict conditions in `backend/app/api/routes/claims.py` and `backend/app/api/routes/investigation.py`.
- Convert streaming failures into `error` SSE events in `backend/app/api/routes/investigation.py` instead of letting the connection die silently.
- Surface fetch and stream failures in the frontend with page-level alerts and `sonner` toasts in `frontend/src/app/page.tsx`, `frontend/src/app/claims/[id]/page.tsx`, and `frontend/src/components/investigation/InvestigationConsole.tsx`.

## Cross-Cutting Concerns

**Logging:** Use Python logging in backend modules such as `backend/app/main.py`, `backend/app/data/loader.py`, `backend/app/orchestrator/triage.py`, and `backend/app/orchestrator/evidence.py`.

**Validation:** Use Pydantic models in `backend/app/data/schemas/` for persisted investigation structures, explicit query/body typing in route files, and mirrored TypeScript interfaces in `frontend/src/lib/types.ts`.

**Authentication:** Not detected. There is no auth provider, session layer, or route guard in `backend/app/` or `frontend/src/app/`; the repo is a synthetic single-user demo surface.

**Configuration:** Keep runtime settings in `backend/app/config.py` and frontend proxy/origin behavior in `frontend/next.config.ts` plus `frontend/src/lib/server-api.ts`.

---

*Architecture analysis: 2026-04-15*

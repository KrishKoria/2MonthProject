# Codebase Structure

**Analysis Date:** 2026-04-15

## Directory Layout

```text
project-root/
├── backend/          # FastAPI service, investigation pipeline, scoring/evidence scripts, and backend tests
├── frontend/         # Next.js App Router workbench and co-located UI/lib tests
├── data/             # Synthetic claims, model outputs, NCCI CSV, policy corpus, and Chroma artifacts
├── docs/             # Narrative design and review notes
├── specs/            # Feature specs, plans, contracts, and checklists
├── src/              # Cross-cutting feature manifest used by backend ML features
├── .planning/        # Planning artifacts, including this codebase map
├── .claude/          # Project-local Claude skills and settings
└── .agents/          # Project-local agent skills
```

## Directory Purposes

**`backend/app/`:**
- Purpose: Runtime backend package.
- Contains: `main.py`, `config.py`, `api/`, `data/`, `evidence/`, `ml/`, `orchestrator/`, and `utils/`.
- Key files: `backend/app/main.py`, `backend/app/data/loader.py`, `backend/app/api/routes/investigation.py`

**`backend/app/api/routes/`:**
- Purpose: Keep one route family per file.
- Contains: Claim list/detail in `backend/app/api/routes/claims.py`, analytics in `backend/app/api/routes/analytics.py`, investigation stream/status/decision routes in `backend/app/api/routes/investigation.py`, and NCCI lookups in `backend/app/api/routes/ncci.py`.
- Key files: `backend/app/api/routes/claims.py`, `backend/app/api/routes/analytics.py`, `backend/app/api/routes/investigation.py`, `backend/app/api/routes/ncci.py`

**`backend/app/data/`:**
- Purpose: Hold runtime data access and schema definitions.
- Contains: Startup loading and persistence in `backend/app/data/loader.py` plus schema modules under `backend/app/data/schemas/`.
- Key files: `backend/app/data/loader.py`, `backend/app/data/schemas/claims.py`, `backend/app/data/schemas/evidence.py`, `backend/app/data/schemas/investigation.py`

**`backend/app/orchestrator/`:**
- Purpose: Keep the investigation pipeline and prompt assets separate from raw API concerns.
- Contains: Workflow nodes (`triage.py`, `evidence.py`, `rationale.py`), helper tools in `tools.py`, graph assembly in `graph.py`, and prompt templates in `prompts/`.
- Key files: `backend/app/orchestrator/triage.py`, `backend/app/orchestrator/evidence.py`, `backend/app/orchestrator/rationale.py`, `backend/app/orchestrator/graph.py`

**`backend/app/evidence/`:**
- Purpose: Isolate NCCI and RAG-specific logic from route and orchestration code.
- Contains: CSV lookup engine, document chunking/indexing, and semantic retrieval.
- Key files: `backend/app/evidence/ncci_engine.py`, `backend/app/evidence/rag_ingest.py`, `backend/app/evidence/rag_embeddings.py`, `backend/app/evidence/rag_retriever.py`

**`backend/app/ml/`:**
- Purpose: Hold model-facing feature, scoring, explanation, and rules code.
- Contains: `features.py`, `rules_baseline.py`, `model.py`, `explainer.py`, and `pipeline.py`.
- Key files: `backend/app/ml/features.py`, `backend/app/ml/model.py`, `backend/app/ml/pipeline.py`

**`backend/scripts/`:**
- Purpose: Manual operational entry points for preparing evidence and scores.
- Contains: `setup_evidence.py`, `train_model.py`, `score_claims.py`, `fetch_public_data.py`, `generate_synthetic_corpus.py`, `validate_prompt.py`.
- Key files: `backend/scripts/setup_evidence.py`, `backend/scripts/train_model.py`, `backend/scripts/score_claims.py`

**`backend/data_generation/`:**
- Purpose: Synthetic corpus generation and validation helpers.
- Contains: Data synthesis and anomaly injection scripts.
- Key files: `backend/data_generation/generate_synthea.py`, `backend/data_generation/inject_anomalies.py`, `backend/data_generation/validate.py`

**`backend/tests/`:**
- Purpose: Central backend test suite.
- Contains: Route tests, orchestration tests, retriever tests, ML tests, and performance checks.
- Key files: `backend/tests/test_api.py`, `backend/tests/test_orchestrator.py`, `backend/tests/test_model.py`, `backend/tests/test_retriever.py`

**`frontend/src/app/`:**
- Purpose: Own route structure and server-rendered page entry points.
- Contains: Global shell in `layout.tsx`, dashboard page in `page.tsx`, queue page in `claims/page.tsx`, and claim detail page in `claims/[id]/page.tsx`.
- Key files: `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`, `frontend/src/app/claims/page.tsx`, `frontend/src/app/claims/[id]/page.tsx`

**`frontend/src/components/`:**
- Purpose: Group UI by feature area rather than by route file.
- Contains: Shared design-system primitives in `frontend/src/components/ui/`, queue UI in `frontend/src/components/claims/`, dashboard widgets in `frontend/src/components/dashboard/`, guidance helpers in `frontend/src/components/guidance/`, investigation UI in `frontend/src/components/investigation/`, and chart wrappers in `frontend/src/components/charts/`.
- Key files: `frontend/src/components/claims/ClaimsExplorer.tsx`, `frontend/src/components/investigation/InvestigationConsole.tsx`, `frontend/src/components/investigation/HumanReviewDesk.tsx`

**`frontend/src/lib/`:**
- Purpose: Hold typed client utilities and non-visual view-model logic.
- Contains: API and SSE clients, URL query parsing, helper utilities, copy, and mirrored backend types.
- Key files: `frontend/src/lib/api.ts`, `frontend/src/lib/sse.ts`, `frontend/src/lib/server-api.ts`, `frontend/src/lib/claims-query.ts`, `frontend/src/lib/types.ts`

**`data/`:**
- Purpose: Store runtime artifacts consumed by the backend.
- Contains: Processed claims in `data/processed/`, feature tables in `data/features/`, model outputs in `data/scores/`, NCCI CSVs in `data/ncci/`, policy documents in `data/policy_docs/`, and Chroma persistence in `data/chroma/`.
- Key files: `data/processed/medical_claims.parquet`, `data/scores/risk_scores.parquet`, `data/scores/model_metadata.json`, `data/ncci/practitioner_ptp_edits.csv`

**`specs/001-claims-investigation-assistant/`:**
- Purpose: Feature-level product and technical reference pack.
- Contains: `spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `quickstart.md`, and API/SSE contracts under `contracts/`.
- Key files: `specs/001-claims-investigation-assistant/plan.md`, `specs/001-claims-investigation-assistant/contracts/api.md`, `specs/001-claims-investigation-assistant/contracts/sse-events.md`

**`src/features/`:**
- Purpose: Keep the scoring feature manifest outside the backend package.
- Contains: `manifest.yml` only.
- Key files: `src/features/manifest.yml`

## Key File Locations

**Entry Points:**
- `backend/app/main.py`: FastAPI app creation, middleware, lifespan wiring, and direct-run `uvicorn` entry point.
- `frontend/src/app/layout.tsx`: Root layout for the Next.js App Router shell.
- `frontend/src/app/page.tsx`: Dashboard route entry point.
- `frontend/src/app/claims/page.tsx`: Claims queue route entry point.
- `frontend/src/app/claims/[id]/page.tsx`: Claim detail and investigation route entry point.
- `backend/scripts/train_model.py`: Manual model-training entry point.
- `backend/scripts/score_claims.py`: Manual score-materialization entry point.

**Configuration:**
- `backend/pyproject.toml`: Backend dependencies, pytest config, and Ruff config.
- `backend/app/config.py`: Backend environment-backed settings and derived data paths.
- `frontend/package.json`: Frontend scripts and dependency graph.
- `frontend/next.config.ts`: API proxy rewrites and React compiler toggle.
- `frontend/tsconfig.json`: Strict TypeScript config and `@/*` path alias.
- `frontend/components.json`: shadcn alias mapping and style registry metadata.

**Core Logic:**
- `backend/app/data/loader.py`: Startup data loading and persisted investigation writes.
- `backend/app/api/routes/claims.py`: Claim queue/detail read model.
- `backend/app/api/routes/investigation.py`: Investigation stream and decision workflow.
- `backend/app/orchestrator/triage.py`: Deterministic anomaly triage.
- `backend/app/orchestrator/evidence.py`: Deterministic evidence aggregation.
- `backend/app/orchestrator/rationale.py`: Streamed rationale generation and validation.
- `backend/app/orchestrator/tools.py`: NCCI, RAG, provider, and duplicate-search tool wrappers.
- `backend/app/ml/pipeline.py`: Batch scoring output assembly.
- `frontend/src/lib/api.ts`: Typed REST client and envelope unwrapping.
- `frontend/src/lib/sse.ts`: Typed streaming client for `POST /api/claims/{id}/investigate`.
- `frontend/src/components/claims/ClaimsExplorer.tsx`: URL-driven queue UI.
- `frontend/src/components/investigation/InvestigationConsole.tsx`: Client-side investigation state machine.

**Testing:**
- `backend/tests/`: Central Python test suite.
- `frontend/src/**/*.test.ts`: Bun-based utility tests, such as `frontend/src/lib/api.test.ts` and `frontend/src/lib/sse.test.ts`.
- `frontend/src/**/*.test.tsx`: Bun + server-render tests for UI components, such as `frontend/src/components/investigation/InvestigationConsole.test.tsx`.

## Naming Conventions

**Files:**
- Use snake_case Python module names in `backend/app/`, `backend/scripts/`, and `backend/data_generation/`, such as `backend/app/data/loader.py` and `backend/app/api/routes/investigation.py`.
- Use lowercase route files in `frontend/src/app/`, matching URL segments directly, such as `frontend/src/app/claims/page.tsx` and `frontend/src/app/claims/[id]/page.tsx`.
- Use PascalCase component filenames for React components in `frontend/src/components/`, such as `frontend/src/components/claims/ClaimsExplorer.tsx` and `frontend/src/components/investigation/HumanReviewDesk.tsx`.
- Use lower-kebab or lower-simple helper filenames in `frontend/src/lib/`, such as `frontend/src/lib/server-api.ts`, `frontend/src/lib/claims-query.ts`, and `frontend/src/lib/types.ts`.

**Directories:**
- Keep backend package directories lowercase and domain-oriented: `api`, `data`, `evidence`, `ml`, `orchestrator`, `utils`.
- Keep frontend feature folders lowercase and route-aligned: `app`, `claims`, `investigation`, `dashboard`, `guidance`, `charts`, `ui`.
- Use Next.js dynamic segment naming for route params, as in `frontend/src/app/claims/[id]/`.

## Where to Add New Code

**New backend API endpoint:**
- Primary code: add a new module under `backend/app/api/routes/` or extend the closest existing route file.
- Wiring: register a new router in `backend/app/main.py` if you create a new route module.
- Schemas: add request/response models under `backend/app/data/schemas/` when the payload shape is reused across routes.
- Tests: add route coverage in `backend/tests/`, usually alongside `backend/tests/test_api.py` or a new route-specific file.

**New investigation step or evidence source:**
- Primary code: add orchestration logic under `backend/app/orchestrator/`.
- Tooling: place deterministic source integrations in `backend/app/orchestrator/tools.py` or `backend/app/evidence/` when they deserve a reusable engine.
- Contracts: update mirrored types in `frontend/src/lib/types.ts` and contract docs in `specs/001-claims-investigation-assistant/contracts/`.
- Tests: extend `backend/tests/test_orchestrator.py` and any route tests that assert stream events.

**New frontend page or route:**
- Primary code: create a route file under `frontend/src/app/`.
- Shared shell: keep global frame changes in `frontend/src/app/layout.tsx`.
- Data fetch: use `frontend/src/lib/server-api.ts` plus `frontend/src/lib/api.ts` in the page file.
- Tests: add component tests near affected components in `frontend/src/components/**` or utility tests in `frontend/src/lib/**`.

**New interactive frontend module:**
- Implementation: put feature UI in the relevant folder under `frontend/src/components/`.
- Helpers/types: place non-visual state logic in `frontend/src/lib/`.
- Contracts: if the component renders backend payloads, update `frontend/src/lib/types.ts` first.

**New ML feature or score artifact:**
- Shared helpers: update `src/features/manifest.yml` and backend feature code in `backend/app/ml/features.py`.
- Scoring pipeline: update `backend/app/ml/pipeline.py` and any training/inference modules in `backend/app/ml/`.
- Rebuild path: update or reuse scripts in `backend/scripts/`.

## Special Directories

**`frontend/.next/`:**
- Purpose: Next.js build and dev output.
- Generated: Yes
- Committed: No

**`frontend/node_modules/`:**
- Purpose: Frontend installed dependencies.
- Generated: Yes
- Committed: No

**`backend/.venv/`:**
- Purpose: Backend local virtual environment.
- Generated: Yes
- Committed: No

**`data/`:**
- Purpose: Runtime data and model artifacts used by the demo.
- Generated: Mixed; some contents are produced by backend scripts and some are treated as checked-in demo assets.
- Committed: Yes

**`specs/001-claims-investigation-assistant/`:**
- Purpose: Feature documentation and implementation contracts.
- Generated: No
- Committed: Yes

**`src/features/`:**
- Purpose: Non-package manifest consumed by backend ML feature code.
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-04-15*

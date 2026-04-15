<!-- GSD:project-start source:PROJECT.md -->
## Project

**Claims Investigation Workbench**

An internal claims-review platform for adjusters and senior reviewers to investigate, adjudicate, and audit insurance claims using AI-assisted analysis. The workbench combines a Next.js 16 / React 19 frontend with a FastAPI backend that runs a LangGraph orchestration pipeline — claims flow through automated triage, evidence gathering, and LLM rationale, then land in a human review queue where role-appropriate decisions are made and recorded.

**Core Value:** Every claim decision must carry clear authority and an immutable audit trail — the right person makes each call, and that record never changes.

### Constraints

- **Tech stack**: Next.js 16, React 19, Better Auth, Drizzle ORM, Neon Postgres, FastAPI, Pydantic v2, Bun, uv, pytest — no changes to core stack
- **Package manager**: Bun for frontend; uv for backend — no npm/pip
- **Auth boundary**: Better Auth lives entirely in Next.js; FastAPI trusts only the proxied identity envelope, never direct browser JWTs
- **Backward compat**: Browser callers stay on `/api/...` paths — only the proxy mechanism changes, not the URLs
- **Parquet data**: Claims data remains file-based (DataStore) in v1; Neon is auth + audit only
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- Python 3.11+ - Backend API, orchestration, ML scoring, data pipelines, and evidence ingestion in `backend/app/`, `backend/scripts/`, and `backend/data_generation/` as declared in `backend/pyproject.toml`.
- TypeScript 5 - Frontend application, API client, SSE client, and UI components in `frontend/src/` with compiler settings in `frontend/tsconfig.json`.
- Markdown - Product, API, and workflow documentation in `README.md`, `backend/README.md`, `frontend/README.md`, `specs/001-claims-investigation-assistant/`, `.claude/skills/`, and `.agents/skills/`.
- JSON - Frontend component registry and persisted model metadata in `frontend/components.json` and `data/scores/model_metadata.json` as loaded by `backend/app/data/loader.py`.
## Runtime
- Python runtime - FastAPI runs through `uvicorn` from `backend/app/main.py`.
- Bun / Node-compatible JavaScript runtime - Next.js 16 frontend runs through scripts in `frontend/package.json`.
- `uv` (version not pinned in repo) - Python dependency management and execution documented in `README.md` and `backend/README.md`.
- Lockfile: present at `backend/uv.lock`.
- Bun (version not pinned in repo) - Frontend package installation, scripts, and tests documented in `README.md` and `frontend/README.md`.
- Lockfile: present at `frontend/bun.lock`.
## Frameworks
- FastAPI 0.115+ - Backend HTTP API and route composition in `backend/app/main.py` and `backend/app/api/routes/*.py`.
- Next.js 16.2.3 - Frontend App Router application in `frontend/src/app/` with config in `frontend/next.config.ts`.
- React 19.2.4 - UI rendering for pages and components in `frontend/src/app/` and `frontend/src/components/`.
- Pydantic 2 / pydantic-settings 2 - Backend schema validation and env-driven settings in `backend/app/data/schemas/` and `backend/app/config.py`.
- `pytest` / `pytest-asyncio` / `pytest-cov` - Backend tests configured in `backend/pyproject.toml` and implemented in `backend/tests/`.
- `bun:test` - Frontend unit tests in `frontend/next.config.test.ts` and `frontend/src/**/*.test.ts(x)`.
- Uvicorn - ASGI server started by `backend/app/main.py`.
- Hatchling - Python build backend configured in `backend/pyproject.toml`.
- ESLint 9 + `eslint-config-next` - Frontend linting via `frontend/package.json`.
- Tailwind CSS v4 - Frontend styling dependency declared in `frontend/package.json` and wired through `frontend/components.json`.
- shadcn/ui with `radix-nova` registry style - Component scaffolding configured in `frontend/components.json`.
- React Compiler - Enabled by `reactCompiler: true` in `frontend/next.config.ts` with `babel-plugin-react-compiler` in `frontend/package.json`.
- Ruff - Python linting configured in `backend/pyproject.toml`.
## Key Dependencies
- `openai` - Async LLM client used for rationale generation in `backend/app/orchestrator/rationale.py` and startup client wiring in `backend/app/data/loader.py`.
- `langchain-openai` - OpenAI embedding adapter used in `backend/app/evidence/rag_embeddings.py`.
- `chromadb` - Local persistent vector store used in `backend/app/evidence/rag_embeddings.py`.
- `langgraph` - Investigation graph runtime referenced by the orchestrator modules in `backend/app/orchestrator/`.
- `xgboost` - Claim risk model training and inference in `backend/app/ml/model.py` and `backend/app/ml/pipeline.py`.
- `shap` - Model explanation support through `backend/app/ml/explainer.py` and downstream use in `backend/app/ml/pipeline.py`.
- `pandas`, `polars`, `pyarrow`, `openpyxl` - File-based claims, scoring, and NCCI data processing in `backend/app/data/loader.py`, `backend/scripts/train_model.py`, `backend/scripts/score_claims.py`, and `backend/scripts/fetch_public_data.py`.
- `sse-starlette` - Server-sent event streaming helpers in `backend/app/utils/sse.py`.
- `httpx` - Async HTTP client dependency for backend development and tests from `backend/pyproject.toml`.
- `requests`, `beautifulsoup4`, `lxml`, `pypdf` - Public-source download and document parsing in `backend/scripts/fetch_public_data.py`.
- `class-variance-authority`, `clsx`, `tailwind-merge` - Frontend styling utilities used across `frontend/src/components/ui/*.tsx`.
- `radix-ui`, `lucide-react`, `motion`, `recharts`, `sonner` - Frontend component primitives, icons, animation, charts, and toast UI in `frontend/src/components/` and `frontend/src/app/layout.tsx`.
## Configuration
- Backend configuration is centralized in `backend/app/config.py` and loaded from `backend/.env` through `pydantic-settings`.
- Frontend runtime origin selection is controlled by `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` in `frontend/next.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/server-api.ts`, and `frontend/src/lib/sse.ts`.
- Repo-level data paths are derived from `DATA_DIR` in `backend/app/config.py`; backend runtime expects `data/processed/`, `data/scores/`, `data/ncci/`, and `data/policy_docs/` as documented in `backend/README.md`.
- Repo-local AI workflow skills live in `.claude/skills/` and `.agents/skills/`; they are documentation/automation assets rather than runtime dependencies.
- `backend/pyproject.toml` - Python dependencies, Ruff, pytest, and hatchling build settings.
- `backend/uv.lock` - Locked Python dependency graph.
- `frontend/package.json` - Frontend scripts and JS dependencies.
- `frontend/bun.lock` - Locked frontend dependency graph.
- `frontend/next.config.ts` - Next.js rewrites and React Compiler enablement.
- `frontend/tsconfig.json` - TypeScript strict mode and `@/*` path alias.
- `frontend/components.json` - shadcn/ui registry and alias configuration.
## Platform Requirements
- Python 3.11+ and `uv` are required for `backend/` per `backend/README.md`.
- Bun is required for `frontend/` per `README.md` and `frontend/README.md`.
- Local data assets under `data/` are required for the backend to load claims, scores, NCCI edits, and policy documents via `backend/app/data/loader.py`.
- `OPENAI_API_KEY` is required for embeddings and streamed rationale generation in `backend/app/evidence/rag_embeddings.py` and `backend/app/orchestrator/rationale.py`.
- Not explicitly defined as a deployment target in the repo.
- Current code assumes a local split deployment: Next.js frontend at `http://localhost:3000` and FastAPI backend at `http://127.0.0.1:8000` per `README.md`, `frontend/README.md`, and `backend/README.md`.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Frontend feature modules use lowercase kebab-case filenames such as `frontend/src/lib/claims-query.ts`, `frontend/src/lib/experience-copy.ts`, and route files under `frontend/src/app/claims/[id]/page.tsx`.
- Frontend React components use PascalCase filenames such as `frontend/src/components/investigation/InvestigationConsole.tsx`, `frontend/src/components/claims/CodeChip.tsx`, and `frontend/src/components/dashboard/ModelMetricsCard.tsx`.
- Backend implementation and test modules use snake_case filenames such as `backend/app/api/routes/investigation.py`, `backend/app/ml/rules_baseline.py`, and `backend/tests/test_orchestrator.py`.
- Test files mirror the implementation name when co-located in frontend (`frontend/src/lib/api.test.ts`) and use `test_*.py` in backend (`backend/tests/test_api.py`).
- Use `camelCase` in TypeScript for helpers and exported utilities: `claimsQueryFromSearchParams`, `claimsQueryToSearchParams`, `getDisplayedAnomalyFlagStatus`, `streamInvestigation` in `frontend/src/lib/*.ts`.
- Use PascalCase for React components and prop types: `InvestigationConsole`, `HumanReviewDesk`, `InvestigationConsoleProps` in `frontend/src/components/investigation/InvestigationConsole.tsx`.
- Use `snake_case` in Python for module helpers and route handlers: `_normalize_score`, `_list_claims_payload`, `submit_decision`, `compute_features` in `backend/app/**/*.py`.
- Use `camelCase` for TypeScript locals/state and `UPPER_SNAKE_CASE` for module constants: `pageSize`, `capturedUrl`, `DEFAULT_CLAIMS_QUERY`, `ANOMALY_ORDER` in `frontend/src/lib/claims-query.ts` and `frontend/src/components/investigation/InvestigationConsole.tsx`.
- Use `snake_case` for Python locals and `UPPER_SNAKE_CASE` for constants: `_SORT_COLUMNS`, `_PROMPT_PATH`, `PLACE_OF_SERVICE_ENCODING`, `lookback_30d` in `backend/app/**/*.py`.
- Use PascalCase for TypeScript types/interfaces/classes: `ClaimsQuery`, `ApiError`, `InvestigationStage`, `EvidenceEnvelope` in `frontend/src/lib/api.ts` and `frontend/src/lib/types.ts`.
- Use PascalCase for Pydantic models and exception types in Python: `Investigation`, `RationaleResult`, `FeatureComputationError`, `RAGRetrievalError` in `backend/app/data/schemas/*.py` and `backend/app/ml/features.py`.
## Code Style
- Frontend formatting is editor-driven plus ESLint. `frontend/eslint.config.mjs` enables `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Backend formatting and import hygiene are driven by Ruff in `backend/pyproject.toml` with `target-version = "py311"` and `line-length = 120`.
- No standalone Prettier, Biome, Black, or isort config is present in `frontend/` or `backend/`.
- Preserve surrounding file style instead of mass-normalizing. Authored frontend files usually use semicolons (`frontend/src/lib/api.ts`, `frontend/src/lib/claims-query.ts`), while shadcn-style utility files may not (`frontend/src/lib/utils.ts`, many files under `frontend/src/components/ui/`).
- Frontend lint command is `eslint` via `frontend/package.json`.
- Backend lint rules come from `[tool.ruff.lint]` in `backend/pyproject.toml` and currently select `E`, `F`, `I`, and `W`.
- `frontend/eslint.config.mjs` explicitly ignores `node_modules`, `.next`, `coverage`, generated build output, and `next-env.d.ts`.
## Import Organization
- `frontend/src/components/investigation/InvestigationConsole.tsx` imports React and third-party packages first, then `@/components`, then `@/lib`, then `./EvidenceCards`.
- `backend/app/api/routes/claims.py` imports standard-library modules, then `pandas` and `fastapi`, then `app.api.dependencies`, `app.data.loader`, and `app.utils.collections`.
- Frontend uses the `@/*` alias defined in `frontend/tsconfig.json`.
- Backend uses package-root imports from `app.*`; no additional alias layer is configured.
## Error Handling
- Raise `HTTPException` for request-level not-found or conflict cases in backend routes such as `backend/app/api/routes/claims.py` and `backend/app/api/routes/investigation.py`.
- Raise `ValueError` for domain validation failures and let `backend/app/main.py` translate them into a consistent `400` JSON payload with `error.code = "validation_error"`.
- Catch unexpected backend exceptions late, log them, and return or emit structured error payloads. See `backend/app/main.py`, `backend/app/api/routes/investigation.py`, and `backend/app/orchestrator/rationale.py`.
- In frontend client code, throw typed `ApiError` from `frontend/src/lib/api.ts` and surface user-facing failures with `toast.error(...)` or `toast.warning(...)` in `frontend/src/components/investigation/InvestigationConsole.tsx` and `frontend/src/components/investigation/HumanReviewDesk.tsx`.
- Prefer explicit safe defaults over implicit coercion. `frontend/src/lib/claims-query.ts` clamps invalid URL params back to defaults instead of throwing.
## Validation
- Use Pydantic `Field(...)` constraints in schema models, for example `confidence: float = Field(ge=0.0, le=1.0)` in `backend/app/data/schemas/evidence.py` and `backend/app/data/schemas/investigation.py`.
- Use FastAPI parameter validation at the route boundary, for example `Query(1, ge=1)` and `Query(25, ge=1, le=100)` in `backend/app/api/routes/claims.py`.
- Validate reconstructed payloads with `model_validate(...)` before returning or persisting them. See `EvidenceEnvelope.model_validate(...)` in `backend/app/api/routes/investigation.py` and `RationaleResult.model_validate(...)` in `backend/app/orchestrator/rationale.py`.
- Use explicit invariant checks for domain-critical math, for example `_check_shap_invariant(...)` in `backend/app/orchestrator/rationale.py` and `FeatureComputationError` in `backend/app/ml/features.py`.
- No schema library such as Zod is used in the active frontend source.
- Validation is manual and type-driven: `frontend/src/lib/claims-query.ts` restricts values through `Set` membership and integer parsing; `frontend/src/lib/api.ts` normalizes base URLs and headers defensively.
## Logging
- Backend logging is configured centrally with `logging.basicConfig(...)` in `backend/app/main.py`.
- Use `logger.info(...)` for lifecycle/data-load events, `logger.warning(...)` for degraded-but-recoverable states, and `logger.exception(...)` for failures with traceback. Examples: `backend/app/data/loader.py`, `backend/app/evidence/rag_retriever.py`, `backend/app/orchestrator/rationale.py`.
- `structlog` is declared in `backend/pyproject.toml` but the current code uses stdlib logging only. Follow the existing `logging.getLogger(__name__)` pattern unless the logging stack is deliberately redesigned.
- Frontend code does not use a logging framework. User-visible feedback is handled with toasts rather than console logging in the reviewed files.
## Comments
- Use module docstrings in Python to state contract-level behavior. This is standard in `backend/app/main.py`, `backend/app/orchestrator/rationale.py`, `backend/app/ml/features.py`, and most backend tests.
- Use short, high-signal comments for invariants, staged pipelines, or generated-code caveats. Examples: SHAP checks in `backend/app/orchestrator/rationale.py`, strict lookback-window comments in `backend/app/ml/features.py`, and explanatory notes in `frontend/src/lib/api.ts`.
- Avoid narration comments for obvious code. Most frontend components rely on readable naming instead of inline commentary.
- Traditional JSDoc/TSDoc blocks are rare in frontend source.
- Python docstrings are the dominant documentation pattern for modules, functions, and tests.
## Function Design
- Keep frontend data and URL helpers small and pure. `frontend/src/lib/claims-query.ts` and `frontend/src/lib/api.ts` are the primary pattern.
- Larger React components are acceptable when they encapsulate one workflow, but they are still decomposed into local helper components. `frontend/src/components/investigation/InvestigationConsole.tsx` defines `Header`, `Timeline`, `TriagePanel`, and `SectionEyebrow` in the same file.
- Backend workflow modules can be long when they encode a full stage contract, but they still isolate private helpers with leading underscores. See `_build_initial_state`, `_triage_result`, and `_persist` in `backend/app/api/routes/investigation.py`.
- Prefer typed params and narrow helper signatures over `any`. TypeScript examples: `parseChoice<T extends string>(...)` and `apiFor(baseUrl: string)` in `frontend/src/lib/*.ts`.
- Python route handlers use explicit typed arguments and annotated dependencies, for example `store: Annotated[DataStore, Depends(get_data_store)]` in `backend/app/api/routes/*.py`.
- Frontend helpers return domain-shaped objects or primitives, not side-effect wrappers. Example: `claimsQueryFromSearchParams(...)` returns `ClaimsQuery`.
- Backend API routes wrap payloads in a `{ data, metadata }` envelope through `_envelope(...)` in `backend/app/api/routes/claims.py` and `backend/app/api/routes/investigation.py`.
- Backend internal stages usually return plain dict state fragments and serialize only at the boundary.
## Module Design
- Frontend favors named exports for reusable helpers and components: `export function claimsQueryFromSearchParams`, `export class ApiError`, `export function InvestigationConsole`.
- Backend packages export modules through direct imports rather than wide public facades. Consumers import concrete modules such as `app.orchestrator.rationale` or `app.ml.model`.
- No TypeScript barrel-file pattern is present under `frontend/src/`.
- Python package `__init__.py` files exist for package structure, not for broad re-export surfaces. Keep imports explicit.
## Process-Level Quality Rules
- `.claude/skills/speckit-superb-tdd/SKILL.md` defines a mandatory RED-GREEN-REFACTOR expectation before implementation.
- `.claude/skills/speckit-superb-verify/SKILL.md` defines a completion gate requiring fresh verification evidence.
- `.claude/skills/reviewing-fullstack/SKILL.md` and `.agents/skills/reality-check/SKILL.md` reinforce skeptical review of correctness, integration, and test support.
- When adding new work, align code and tests with those repo-local quality expectations even though they are process artifacts rather than runtime code.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Use server-rendered route handlers in `frontend/src/app/` for initial data fetches, then hand off claim-queue filters and investigation streaming to client components in `frontend/src/components/`.
- Load claim, roster, score, NCCI, and persisted investigation artifacts into one in-memory `DataStore` during FastAPI lifespan startup in `backend/app/data/loader.py`; request handlers read that store instead of hitting a database.
- Keep investigation execution deterministic until the final rationale step: `backend/app/orchestrator/triage.py` and `backend/app/orchestrator/evidence.py` run local logic first, and `backend/app/orchestrator/rationale.py` is the only OpenAI-backed stage.
## Layers
- Purpose: Define page entry points and fetch initial page data on the server.
- Location: `frontend/src/app/`
- Contains: `layout.tsx`, dashboard page in `frontend/src/app/page.tsx`, queue page in `frontend/src/app/claims/page.tsx`, detail page in `frontend/src/app/claims/[id]/page.tsx`, and global CSS in `frontend/src/app/globals.css`.
- Depends on: `frontend/src/lib/api.ts`, `frontend/src/lib/server-api.ts`, `frontend/src/lib/types.ts`, and feature components under `frontend/src/components/`.
- Used by: Next.js runtime configured in `frontend/next.config.ts`.
- Purpose: Isolate browser behavior, URL/query translation, typed REST helpers, and typed SSE parsing from page files.
- Location: `frontend/src/lib/`
- Contains: REST client in `frontend/src/lib/api.ts`, server-side base URL resolution in `frontend/src/lib/server-api.ts`, queue query encoding in `frontend/src/lib/claims-query.ts`, SSE parser in `frontend/src/lib/sse.ts`, UI copy in `frontend/src/lib/experience-copy.ts`, and mirrored backend contracts in `frontend/src/lib/types.ts`.
- Depends on: `fetch`, Next.js request headers via `frontend/src/lib/server-api.ts`, and the backend API/SSE contracts documented in `specs/001-claims-investigation-assistant/contracts/`.
- Used by: Server route files in `frontend/src/app/` and client components such as `frontend/src/components/claims/ClaimsExplorer.tsx` and `frontend/src/components/investigation/InvestigationConsole.tsx`.
- Purpose: Expose HTTP and SSE endpoints and translate in-memory backend state into API envelopes.
- Location: `backend/app/main.py`, `backend/app/api/dependencies.py`, `backend/app/api/routes/`
- Contains: App bootstrap and middleware in `backend/app/main.py`, dependency providers in `backend/app/api/dependencies.py`, claim routes in `backend/app/api/routes/claims.py`, analytics routes in `backend/app/api/routes/analytics.py`, investigation routes in `backend/app/api/routes/investigation.py`, and direct NCCI lookup in `backend/app/api/routes/ncci.py`.
- Depends on: `DataStore` from `backend/app/data/loader.py`, schemas from `backend/app/data/schemas/`, orchestration modules in `backend/app/orchestrator/`, and utilities in `backend/app/utils/`.
- Used by: The Next.js frontend through `/api/...` rewrites from `frontend/next.config.ts` and by direct backend consumers.
- Purpose: Centralize startup data loading, persisted investigation writes, and backend schema definitions.
- Location: `backend/app/data/`
- Contains: In-memory store and lifespan logic in `backend/app/data/loader.py`; claim, evidence, and investigation models in `backend/app/data/schemas/claims.py`, `backend/app/data/schemas/evidence.py`, and `backend/app/data/schemas/investigation.py`.
- Depends on: `backend/app/config.py` and repo-level artifacts under `data/processed/`, `data/scores/`, and `data/ncci/`.
- Used by: Every backend route and orchestration module via dependency injection or direct imports.
- Purpose: Define the claim investigation workflow and its state transitions.
- Location: `backend/app/orchestrator/`
- Contains: Triaging in `backend/app/orchestrator/triage.py`, evidence aggregation in `backend/app/orchestrator/evidence.py`, tool wrappers in `backend/app/orchestrator/tools.py`, LLM rationale streaming in `backend/app/orchestrator/rationale.py`, graph definition in `backend/app/orchestrator/graph.py`, and prompt template in `backend/app/orchestrator/prompts/rationale.md`.
- Depends on: `DataStore`, evidence helpers, shared schemas, and `backend/app/config.py`.
- Used by: `backend/app/api/routes/investigation.py`; `backend/app/orchestrator/graph.py` also serves as the canonical non-streaming graph definition for tests and alternate invocation paths.
- Purpose: Provide deterministic helpers for coding-rule checks and policy retrieval.
- Location: `backend/app/evidence/`
- Contains: NCCI CSV engine in `backend/app/evidence/ncci_engine.py`, RAG chunk ingestion in `backend/app/evidence/rag_ingest.py`, Chroma indexing in `backend/app/evidence/rag_embeddings.py`, and semantic retrieval in `backend/app/evidence/rag_retriever.py`.
- Depends on: Repo-level `data/ncci/`, `data/policy_docs/`, `data/chroma/`, and settings in `backend/app/config.py`.
- Used by: `backend/app/orchestrator/tools.py` and maintenance scripts in `backend/scripts/`.
- Purpose: Define feature engineering, deterministic rules, model inference, and batch scoring artifacts.
- Location: `backend/app/ml/` and `src/features/manifest.yml`
- Contains: Feature computation in `backend/app/ml/features.py`, rules baseline in `backend/app/ml/rules_baseline.py`, model training/inference in `backend/app/ml/model.py`, SHAP explanations in `backend/app/ml/explainer.py`, and score materialization in `backend/app/ml/pipeline.py`.
- Depends on: Claims artifacts under `data/`, NCCI lookups from `backend/app/evidence/ncci_engine.py`, and the manifest in `src/features/manifest.yml`.
- Used by: Offline scripts in `backend/scripts/`; API routes only read the resulting scored outputs from `data/scores/`.
- Purpose: Rebuild synthetic data, evidence corpus, model artifacts, and scores outside request handling.
- Location: `backend/data_generation/` and `backend/scripts/`
- Contains: Synthetic data generation utilities in `backend/data_generation/*.py` and operational scripts such as `backend/scripts/setup_evidence.py`, `backend/scripts/train_model.py`, and `backend/scripts/score_claims.py`.
- Depends on: Backend ML/evidence modules and repo-level `data/`.
- Used by: Developers refreshing artifacts; not used directly by the running frontend.
## Data Flow
- Treat the queue URL as the source of truth for list filters and sorting in `frontend/src/lib/claims-query.ts` and `frontend/src/components/claims/ClaimsExplorer.tsx`.
- Keep page-level data fetching on the server in `frontend/src/app/`, but move transient review state into client components such as `frontend/src/components/investigation/InvestigationConsole.tsx` and `frontend/src/components/investigation/HumanReviewDesk.tsx`.
- Keep backend runtime state in one startup-loaded `DataStore` instance from `backend/app/data/loader.py`; persist only investigations back to `data/scores/investigations.parquet`.
## Key Abstractions
- Purpose: Represent the runtime backend state as loaded DataFrames plus persisted investigations.
- Examples: `backend/app/data/loader.py`, `backend/app/api/dependencies.py`
- Pattern: Lifespan-loaded singleton-like state injected through FastAPI request dependencies.
- Purpose: Standardize all backend responses behind `{ data, metadata }` and centralize error handling.
- Examples: `backend/app/api/routes/claims.py`, `backend/app/api/routes/analytics.py`, `frontend/src/lib/api.ts`, `specs/001-claims-investigation-assistant/contracts/api.md`
- Pattern: Backend route-local `_envelope` helpers plus a frontend unwrapping client.
- Purpose: Define the orchestration state that moves between triage, evidence, and rationale steps.
- Examples: `backend/app/data/schemas/investigation.py`, `backend/app/orchestrator/graph.py`
- Pattern: TypedDict-based state graph plus direct node invocation from the streaming route.
- Purpose: Keep evidence results complete even when some sources are unavailable.
- Examples: `backend/app/data/schemas/evidence.py`, `backend/app/orchestrator/evidence.py`, `backend/app/orchestrator/tools.py`
- Pattern: Aggregate object with per-source status records rather than optional ad hoc fields.
- Purpose: Keep TypeScript rendering code aligned with backend Pydantic schemas without importing Python code.
- Examples: `frontend/src/lib/types.ts`, `backend/app/data/schemas/claims.py`, `backend/app/data/schemas/evidence.py`, `backend/app/data/schemas/investigation.py`
- Pattern: Manual contract mirroring backed by spec docs under `specs/001-claims-investigation-assistant/contracts/`.
## Entry Points
- Location: `backend/app/main.py`
- Triggers: `uv run app/main.py` or `uv run uvicorn app.main:app --reload`
- Responsibilities: Create the FastAPI app, attach CORS and timing middleware, load lifespan state, register route modules, and start uvicorn when executed directly.
- Location: `frontend/src/app/layout.tsx`
- Triggers: Next.js App Router startup from `bun run dev`, `bun run build`, or `next start`
- Responsibilities: Establish global shell chrome, top-level navigation, tooltip/toast providers, and shared page framing.
- Location: `frontend/src/app/page.tsx`
- Triggers: Route `/`
- Responsibilities: Fetch analytics and model-performance payloads and compose dashboard cards/charts.
- Location: `frontend/src/app/claims/page.tsx`
- Triggers: Route `/claims`
- Responsibilities: Convert `searchParams` into a canonical `ClaimsQuery`, fetch paginated rows, and mount `ClaimsExplorer`.
- Location: `frontend/src/app/claims/[id]/page.tsx`
- Triggers: Route `/claims/[id]`
- Responsibilities: Fetch one claim, render fact and risk panels, and mount `InvestigationConsole`.
- Location: `backend/scripts/*.py`, `backend/data_generation/*.py`
- Triggers: Manual developer runs
- Responsibilities: Refresh source data, vector indexes, models, and scored outputs that the runtime later consumes.
## Error Handling
- Use FastAPI exception handlers in `backend/app/main.py` for `ValueError` and uncaught exceptions.
- Raise `HTTPException` for route-local missing-resource or conflict conditions in `backend/app/api/routes/claims.py` and `backend/app/api/routes/investigation.py`.
- Convert streaming failures into `error` SSE events in `backend/app/api/routes/investigation.py` instead of letting the connection die silently.
- Surface fetch and stream failures in the frontend with page-level alerts and `sonner` toasts in `frontend/src/app/page.tsx`, `frontend/src/app/claims/[id]/page.tsx`, and `frontend/src/components/investigation/InvestigationConsole.tsx`.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| reviewing-fullstack | Reviews a mixed Next.js TypeScript frontend and Python backend for correctness, completeness, performance, and integration risk. Use when auditing whether the implementation actually works, handles edge cases, and is supported by code and tests rather than appearances. | `.claude/skills/reviewing-fullstack/SKILL.md` |
| speckit-aide-create-item | Create a detailed work item specification from a queue item. | `.claude/skills/speckit-aide-create-item/SKILL.md` |
| speckit-aide-create-progress | Create a progress tracking file from the vision and roadmap. | `.claude/skills/speckit-aide-create-progress/SKILL.md` |
| speckit-aide-create-queue | Generate a prioritized queue of the next batch of work items. | `.claude/skills/speckit-aide-create-queue/SKILL.md` |
| speckit-aide-create-roadmap | Generate a staged development roadmap from the vision document. | `.claude/skills/speckit-aide-create-roadmap/SKILL.md` |
| speckit-aide-create-vision | Create a comprehensive vision document for a new project. | `.claude/skills/speckit-aide-create-vision/SKILL.md` |
| speckit-aide-execute-item | Implement a work item and update progress tracking. | `.claude/skills/speckit-aide-execute-item/SKILL.md` |
| speckit-aide-feedback-loop | Analyze issues and suggest improvements to the process and documents. | `.claude/skills/speckit-aide-feedback-loop/SKILL.md` |
| "speckit-analyze" | "Perform a non-destructive cross-artifact consistency and quality analysis across spec.md, plan.md, and tasks.md after task generation." | `.claude/skills/speckit-analyze/SKILL.md` |
| "speckit-checklist" | "Generate a custom checklist for the current feature based on user requirements." | `.claude/skills/speckit-checklist/SKILL.md` |
| "speckit-clarify" | "Identify underspecified areas in the current feature spec by asking up to 5 highly targeted clarification questions and encoding answers back into the spec." | `.claude/skills/speckit-clarify/SKILL.md` |
| speckit-cleanup | Post-implementation quality gate that reviews changes, fixes small issues (scout rule), creates tasks for medium issues, and generates analysis for large issues. | `.claude/skills/speckit-cleanup/SKILL.md` |
| speckit-cleanup-run | Post-implementation quality gate that reviews changes, fixes small issues (scout rule), creates tasks for medium issues, and generates analysis for large issues. | `.claude/skills/speckit-cleanup-run/SKILL.md` |
| "speckit-constitution" | "Create or update the project constitution from interactive or provided principle inputs, ensuring all dependent templates stay in sync." | `.claude/skills/speckit-constitution/SKILL.md` |
| speckit-diagram-dependencies | Generate a Mermaid DAG of task dependencies from tasks.md | `.claude/skills/speckit-diagram-dependencies/SKILL.md` |
| speckit-diagram-status | Generate a Mermaid diagram showing feature progress across SDD phases | `.claude/skills/speckit-diagram-status/SKILL.md` |
| speckit-diagram-workflow | Generate a Mermaid flowchart of the full SDD workflow for the current project | `.claude/skills/speckit-diagram-workflow/SKILL.md` |
| speckit-git-commit | Auto-commit changes after a Spec Kit command completes | `.claude/skills/speckit-git-commit/SKILL.md` |
| speckit-git-feature | Create a feature branch with sequential or timestamp numbering | `.claude/skills/speckit-git-feature/SKILL.md` |
| speckit-git-initialize | Initialize a Git repository with an initial commit | `.claude/skills/speckit-git-initialize/SKILL.md` |
| speckit-git-remote | Detect Git remote URL for GitHub integration | `.claude/skills/speckit-git-remote/SKILL.md` |
| speckit-git-validate | Validate current branch follows feature branch naming conventions | `.claude/skills/speckit-git-validate/SKILL.md` |
| "speckit-implement" | "Execute the implementation plan by processing and executing all tasks defined in tasks.md" | `.claude/skills/speckit-implement/SKILL.md` |
| speckit-optimize-learn | Analyze AI session patterns to suggest constitution rules or memory entries. | `.claude/skills/speckit-optimize-learn/SKILL.md` |
| speckit-optimize-run | Audit and optimize governance documents for AI context efficiency. | `.claude/skills/speckit-optimize-run/SKILL.md` |
| speckit-optimize-tokens | Track and report token usage across extensions and governance files. | `.claude/skills/speckit-optimize-tokens/SKILL.md` |
| "speckit-plan" | "Execute the implementation planning workflow using the plan template to generate design artifacts." | `.claude/skills/speckit-plan/SKILL.md` |
| "speckit-specify" | "Create or update the feature specification from a natural language feature description." | `.claude/skills/speckit-specify/SKILL.md` |
| speckit-superb-clarify | Orchestrates the obra/superpowers brainstorming skill within the spec-kit specify workflow. Loads the authoritative SKILL.md at runtime, binds spec-kit context, and produces an intent summary for speckit.specify. | `.claude/skills/speckit-superb-clarify/SKILL.md` |
| speckit-superb-critique | 'Spec-aligned code review agent. Acts as a dedicated independent reviewer: loads spec.md, plan.md, and tasks.md, then reviews every code change against declared requirements, reporting issues by severity. Use after any significant implementation to catch spec divergence before it compounds.  ' | `.claude/skills/speckit-superb-critique/SKILL.md` |
| speckit-superb-debug | Systematic debugging protocol. Loads the obra/superpowers systematic-debugging SKILL.md at runtime. Enforces root-cause investigation before any fix attempt. Use when TDD hits repeated failures or any unexpected behavior surfaces during implementation. | `.claude/skills/speckit-superb-debug/SKILL.md` |
| speckit-superb-finish | "Development branch completion protocol. Loads the obra/superpowers finishing-a-development-branch\ \ SKILL.md at runtime. Guides the user through structured options (merge, PR, keep,\ \ discard) after verification passes.\n Call manually after speckit.superb.verify\ \ succeeds." | `.claude/skills/speckit-superb-finish/SKILL.md` |
| speckit-superb-respond | "Code review response protocol. Loads the obra/superpowers receiving-code-review\ \ SKILL.md at runtime. Enforces technical verification before implementing review\ \ feedback — no performative agreement, no blind\n fixes. Pairs with speckit.superb.critique\ \ as the implementer\ncounterpart." | `.claude/skills/speckit-superb-respond/SKILL.md` |
| speckit-superb-review | Verify the generated tasks.md covers every requirement in spec.md before implementation begins. Produces a spec-coverage matrix and a gap report. Catches missing or under-specified tasks at planning time, not delivery time. | `.claude/skills/speckit-superb-review/SKILL.md` |
| speckit-superb-tdd | Mandatory pre-implement TDD gate. Loads the obra/superpowers test-driven-development SKILL.md at runtime and binds it to spec-kit's tasks.md task structure. Enforces RED-GREEN-REFACTOR for every task. | `.claude/skills/speckit-superb-tdd/SKILL.md` |
| speckit-superb-verify | Mandatory completion gate. Loads the obra/superpowers verification skill at runtime and extends it with spec-kit's spec-coverage checklist. No task may be marked done without fresh evidence. | `.claude/skills/speckit-superb-verify/SKILL.md` |
| "speckit-tasks" | "Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts." | `.claude/skills/speckit-tasks/SKILL.md` |
| "speckit-taskstoissues" | "Convert existing tasks into actionable, dependency-ordered GitHub issues for the feature based on available design artifacts." | `.claude/skills/speckit-taskstoissues/SKILL.md` |
| speckit-worktree-clean | Remove stale or merged worktrees and reclaim disk space | `.claude/skills/speckit-worktree-clean/SKILL.md` |
| speckit-worktree-create | Spawn an isolated git worktree for a new or existing feature branch | `.claude/skills/speckit-worktree-create/SKILL.md` |
| speckit-worktree-list | Show all active worktrees with feature status and spec artifact summary | `.claude/skills/speckit-worktree-list/SKILL.md` |
| reality-check | Deep forensic review skill for repositories with a Next.js TypeScript frontend and Python backend. Use when auditing correctness, completeness, performance, integration quality, and whether code is genuinely sound or only superficially convincing. Prefer structured decomposition, relevant skills, and MCP tools such as Sequential Thinking when the task is complex. | `.agents/skills/reality-check/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

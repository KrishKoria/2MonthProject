# Coding Conventions

**Analysis Date:** 2026-04-15

## Naming Patterns

**Files:**
- Frontend feature modules use lowercase kebab-case filenames such as `frontend/src/lib/claims-query.ts`, `frontend/src/lib/experience-copy.ts`, and route files under `frontend/src/app/claims/[id]/page.tsx`.
- Frontend React components use PascalCase filenames such as `frontend/src/components/investigation/InvestigationConsole.tsx`, `frontend/src/components/claims/CodeChip.tsx`, and `frontend/src/components/dashboard/ModelMetricsCard.tsx`.
- Backend implementation and test modules use snake_case filenames such as `backend/app/api/routes/investigation.py`, `backend/app/ml/rules_baseline.py`, and `backend/tests/test_orchestrator.py`.
- Test files mirror the implementation name when co-located in frontend (`frontend/src/lib/api.test.ts`) and use `test_*.py` in backend (`backend/tests/test_api.py`).

**Functions:**
- Use `camelCase` in TypeScript for helpers and exported utilities: `claimsQueryFromSearchParams`, `claimsQueryToSearchParams`, `getDisplayedAnomalyFlagStatus`, `streamInvestigation` in `frontend/src/lib/*.ts`.
- Use PascalCase for React components and prop types: `InvestigationConsole`, `HumanReviewDesk`, `InvestigationConsoleProps` in `frontend/src/components/investigation/InvestigationConsole.tsx`.
- Use `snake_case` in Python for module helpers and route handlers: `_normalize_score`, `_list_claims_payload`, `submit_decision`, `compute_features` in `backend/app/**/*.py`.

**Variables:**
- Use `camelCase` for TypeScript locals/state and `UPPER_SNAKE_CASE` for module constants: `pageSize`, `capturedUrl`, `DEFAULT_CLAIMS_QUERY`, `ANOMALY_ORDER` in `frontend/src/lib/claims-query.ts` and `frontend/src/components/investigation/InvestigationConsole.tsx`.
- Use `snake_case` for Python locals and `UPPER_SNAKE_CASE` for constants: `_SORT_COLUMNS`, `_PROMPT_PATH`, `PLACE_OF_SERVICE_ENCODING`, `lookback_30d` in `backend/app/**/*.py`.

**Types:**
- Use PascalCase for TypeScript types/interfaces/classes: `ClaimsQuery`, `ApiError`, `InvestigationStage`, `EvidenceEnvelope` in `frontend/src/lib/api.ts` and `frontend/src/lib/types.ts`.
- Use PascalCase for Pydantic models and exception types in Python: `Investigation`, `RationaleResult`, `FeatureComputationError`, `RAGRetrievalError` in `backend/app/data/schemas/*.py` and `backend/app/ml/features.py`.

## Code Style

**Formatting:**
- Frontend formatting is editor-driven plus ESLint. `frontend/eslint.config.mjs` enables `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Backend formatting and import hygiene are driven by Ruff in `backend/pyproject.toml` with `target-version = "py311"` and `line-length = 120`.
- No standalone Prettier, Biome, Black, or isort config is present in `frontend/` or `backend/`.
- Preserve surrounding file style instead of mass-normalizing. Authored frontend files usually use semicolons (`frontend/src/lib/api.ts`, `frontend/src/lib/claims-query.ts`), while shadcn-style utility files may not (`frontend/src/lib/utils.ts`, many files under `frontend/src/components/ui/`).

**Linting:**
- Frontend lint command is `eslint` via `frontend/package.json`.
- Backend lint rules come from `[tool.ruff.lint]` in `backend/pyproject.toml` and currently select `E`, `F`, `I`, and `W`.
- `frontend/eslint.config.mjs` explicitly ignores `node_modules`, `.next`, `coverage`, generated build output, and `next-env.d.ts`.

## Import Organization

**Order:**
1. Standard library or platform imports first.
2. Third-party packages next.
3. Internal alias imports next in frontend (`@/...`) or `app.*` imports in backend.
4. Relative imports last.

**Observed patterns:**
- `frontend/src/components/investigation/InvestigationConsole.tsx` imports React and third-party packages first, then `@/components`, then `@/lib`, then `./EvidenceCards`.
- `backend/app/api/routes/claims.py` imports standard-library modules, then `pandas` and `fastapi`, then `app.api.dependencies`, `app.data.loader`, and `app.utils.collections`.

**Path Aliases:**
- Frontend uses the `@/*` alias defined in `frontend/tsconfig.json`.
- Backend uses package-root imports from `app.*`; no additional alias layer is configured.

## Error Handling

**Patterns:**
- Raise `HTTPException` for request-level not-found or conflict cases in backend routes such as `backend/app/api/routes/claims.py` and `backend/app/api/routes/investigation.py`.
- Raise `ValueError` for domain validation failures and let `backend/app/main.py` translate them into a consistent `400` JSON payload with `error.code = "validation_error"`.
- Catch unexpected backend exceptions late, log them, and return or emit structured error payloads. See `backend/app/main.py`, `backend/app/api/routes/investigation.py`, and `backend/app/orchestrator/rationale.py`.
- In frontend client code, throw typed `ApiError` from `frontend/src/lib/api.ts` and surface user-facing failures with `toast.error(...)` or `toast.warning(...)` in `frontend/src/components/investigation/InvestigationConsole.tsx` and `frontend/src/components/investigation/HumanReviewDesk.tsx`.
- Prefer explicit safe defaults over implicit coercion. `frontend/src/lib/claims-query.ts` clamps invalid URL params back to defaults instead of throwing.

## Validation

**Backend validation:**
- Use Pydantic `Field(...)` constraints in schema models, for example `confidence: float = Field(ge=0.0, le=1.0)` in `backend/app/data/schemas/evidence.py` and `backend/app/data/schemas/investigation.py`.
- Use FastAPI parameter validation at the route boundary, for example `Query(1, ge=1)` and `Query(25, ge=1, le=100)` in `backend/app/api/routes/claims.py`.
- Validate reconstructed payloads with `model_validate(...)` before returning or persisting them. See `EvidenceEnvelope.model_validate(...)` in `backend/app/api/routes/investigation.py` and `RationaleResult.model_validate(...)` in `backend/app/orchestrator/rationale.py`.
- Use explicit invariant checks for domain-critical math, for example `_check_shap_invariant(...)` in `backend/app/orchestrator/rationale.py` and `FeatureComputationError` in `backend/app/ml/features.py`.

**Frontend validation:**
- No schema library such as Zod is used in the active frontend source.
- Validation is manual and type-driven: `frontend/src/lib/claims-query.ts` restricts values through `Set` membership and integer parsing; `frontend/src/lib/api.ts` normalizes base URLs and headers defensively.

## Logging

**Framework:** Python `logging`

**Patterns:**
- Backend logging is configured centrally with `logging.basicConfig(...)` in `backend/app/main.py`.
- Use `logger.info(...)` for lifecycle/data-load events, `logger.warning(...)` for degraded-but-recoverable states, and `logger.exception(...)` for failures with traceback. Examples: `backend/app/data/loader.py`, `backend/app/evidence/rag_retriever.py`, `backend/app/orchestrator/rationale.py`.
- `structlog` is declared in `backend/pyproject.toml` but the current code uses stdlib logging only. Follow the existing `logging.getLogger(__name__)` pattern unless the logging stack is deliberately redesigned.
- Frontend code does not use a logging framework. User-visible feedback is handled with toasts rather than console logging in the reviewed files.

## Comments

**When to Comment:**
- Use module docstrings in Python to state contract-level behavior. This is standard in `backend/app/main.py`, `backend/app/orchestrator/rationale.py`, `backend/app/ml/features.py`, and most backend tests.
- Use short, high-signal comments for invariants, staged pipelines, or generated-code caveats. Examples: SHAP checks in `backend/app/orchestrator/rationale.py`, strict lookback-window comments in `backend/app/ml/features.py`, and explanatory notes in `frontend/src/lib/api.ts`.
- Avoid narration comments for obvious code. Most frontend components rely on readable naming instead of inline commentary.

**JSDoc/TSDoc:**
- Traditional JSDoc/TSDoc blocks are rare in frontend source.
- Python docstrings are the dominant documentation pattern for modules, functions, and tests.

## Function Design

**Size:**
- Keep frontend data and URL helpers small and pure. `frontend/src/lib/claims-query.ts` and `frontend/src/lib/api.ts` are the primary pattern.
- Larger React components are acceptable when they encapsulate one workflow, but they are still decomposed into local helper components. `frontend/src/components/investigation/InvestigationConsole.tsx` defines `Header`, `Timeline`, `TriagePanel`, and `SectionEyebrow` in the same file.
- Backend workflow modules can be long when they encode a full stage contract, but they still isolate private helpers with leading underscores. See `_build_initial_state`, `_triage_result`, and `_persist` in `backend/app/api/routes/investigation.py`.

**Parameters:**
- Prefer typed params and narrow helper signatures over `any`. TypeScript examples: `parseChoice<T extends string>(...)` and `apiFor(baseUrl: string)` in `frontend/src/lib/*.ts`.
- Python route handlers use explicit typed arguments and annotated dependencies, for example `store: Annotated[DataStore, Depends(get_data_store)]` in `backend/app/api/routes/*.py`.

**Return Values:**
- Frontend helpers return domain-shaped objects or primitives, not side-effect wrappers. Example: `claimsQueryFromSearchParams(...)` returns `ClaimsQuery`.
- Backend API routes wrap payloads in a `{ data, metadata }` envelope through `_envelope(...)` in `backend/app/api/routes/claims.py` and `backend/app/api/routes/investigation.py`.
- Backend internal stages usually return plain dict state fragments and serialize only at the boundary.

## Module Design

**Exports:**
- Frontend favors named exports for reusable helpers and components: `export function claimsQueryFromSearchParams`, `export class ApiError`, `export function InvestigationConsole`.
- Backend packages export modules through direct imports rather than wide public facades. Consumers import concrete modules such as `app.orchestrator.rationale` or `app.ml.model`.

**Barrel Files:**
- No TypeScript barrel-file pattern is present under `frontend/src/`.
- Python package `__init__.py` files exist for package structure, not for broad re-export surfaces. Keep imports explicit.

## Process-Level Quality Rules

**Project-local skills:**
- `.claude/skills/speckit-superb-tdd/SKILL.md` defines a mandatory RED-GREEN-REFACTOR expectation before implementation.
- `.claude/skills/speckit-superb-verify/SKILL.md` defines a completion gate requiring fresh verification evidence.
- `.claude/skills/reviewing-fullstack/SKILL.md` and `.agents/skills/reality-check/SKILL.md` reinforce skeptical review of correctness, integration, and test support.
- When adding new work, align code and tests with those repo-local quality expectations even though they are process artifacts rather than runtime code.

---

*Convention analysis: 2026-04-15*

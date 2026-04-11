# Claude Code Context

<!-- BEGIN SPECIFY MANAGED — do not edit this block manually -->

## Active Feature

**Feature**: Claims Investigation Intelligence Assistant
**Branch**: main
**Spec**: specs/001-claims-investigation-assistant/spec.md
**Plan**: specs/001-claims-investigation-assistant/plan.md

## Technology Stack

- **Language**: Python 3.11 (backend), TypeScript 5.x (frontend)
- **Project type**: Full-stack web application (frontend + backend monorepo)
- **Storage**: Parquet files loaded into memory at FastAPI startup (medallion schema). ChromaDB for vector store. NCCI rules as CSV. No relational DB / ORM.
- **Backend**: FastAPI, LangGraph, LangChain, ChromaDB, XGBoost, SHAP, scikit-learn, Pandas, Polars, Pydantic v2, sse-starlette, openai
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, shadcn/ui, Recharts, TypeScript strict mode
- **Testing**: pytest (backend), Vitest (frontend)

## Key Architecture Rules (Constitution)

1. **Deterministic First, LLM Last**: Triage and evidence nodes are deterministic Python. Only the rationale node calls an LLM (single call).
2. **Test-First for Temporal Integrity**: `test_no_future_leakage()` must be written and FAILING before any feature engineering code is committed.
3. **Evidence-Gated Synthesis**: Empty evidence halts the pipeline (`manual_review_required`). No LLM call on empty context.
4. **Parquet-Native**: All data loaded at startup. No runtime I/O in request handlers. No ORM.
5. **Minimal Viable Surface**: Exactly 3 frontend pages. SSE is a blocking dependency before any investigation UI.
6. All API schemas use Pydantic. All route handlers and LangGraph nodes are async. No bare `except:`.
7. TypeScript strict mode enforced. No `any` without justification.
8. LLM mocked in all orchestrator integration tests.
9. **Output Correctness** (Principle VI): Feature engineering validated against ≥10 hand-computed claim fixtures; XGBoost MUST NOT be promoted if precision at threshold < 0.75; SHAP attributions MUST sum to (pred − base) within 1e-5; NCCI lookups cross-checked against reference fixtures in `backend/tests/test_ncci_engine.py`; LLM rationale MUST pass Pydantic schema validation before response returned; claim status MUST follow state machine (`pending_review → {accepted | rejected | escalated | manual_review_required}`).
10. **Investigation Completeness** (Principle VII): Triage evaluates all 3 anomaly types with explicit `not_applicable` flag; evidence node attempts all 4 sources (unavailable ones recorded); LLM rationale addresses every raised anomaly flag; all features in `src/features/manifest.yml` must be computed or raise `FeatureComputationError`; ≥80% line coverage on `backend/app/ml/`, `backend/app/orchestrator/`, `backend/app/api/`.
11. **Scope Deferral** — out of scope for v1 (amend constitution to change): Isolation Forest, embedded chat, NCCI modifier-bypass, multi-agent LLM, SQLite/ORM, full analytics page, production auth, real PHI.

<!-- END SPECIFY MANAGED -->

# Technology Stack

**Analysis Date:** 2026-04-15

## Languages

**Primary:**
- Python 3.11+ - Backend API, orchestration, ML scoring, data pipelines, and evidence ingestion in `backend/app/`, `backend/scripts/`, and `backend/data_generation/` as declared in `backend/pyproject.toml`.
- TypeScript 5 - Frontend application, API client, SSE client, and UI components in `frontend/src/` with compiler settings in `frontend/tsconfig.json`.

**Secondary:**
- Markdown - Product, API, and workflow documentation in `README.md`, `backend/README.md`, `frontend/README.md`, `specs/001-claims-investigation-assistant/`, `.claude/skills/`, and `.agents/skills/`.
- JSON - Frontend component registry and persisted model metadata in `frontend/components.json` and `data/scores/model_metadata.json` as loaded by `backend/app/data/loader.py`.

## Runtime

**Environment:**
- Python runtime - FastAPI runs through `uvicorn` from `backend/app/main.py`.
- Bun / Node-compatible JavaScript runtime - Next.js 16 frontend runs through scripts in `frontend/package.json`.

**Package Manager:**
- `uv` (version not pinned in repo) - Python dependency management and execution documented in `README.md` and `backend/README.md`.
- Lockfile: present at `backend/uv.lock`.
- Bun (version not pinned in repo) - Frontend package installation, scripts, and tests documented in `README.md` and `frontend/README.md`.
- Lockfile: present at `frontend/bun.lock`.

## Frameworks

**Core:**
- FastAPI 0.115+ - Backend HTTP API and route composition in `backend/app/main.py` and `backend/app/api/routes/*.py`.
- Next.js 16.2.3 - Frontend App Router application in `frontend/src/app/` with config in `frontend/next.config.ts`.
- React 19.2.4 - UI rendering for pages and components in `frontend/src/app/` and `frontend/src/components/`.
- Pydantic 2 / pydantic-settings 2 - Backend schema validation and env-driven settings in `backend/app/data/schemas/` and `backend/app/config.py`.

**Testing:**
- `pytest` / `pytest-asyncio` / `pytest-cov` - Backend tests configured in `backend/pyproject.toml` and implemented in `backend/tests/`.
- `bun:test` - Frontend unit tests in `frontend/next.config.test.ts` and `frontend/src/**/*.test.ts(x)`.

**Build/Dev:**
- Uvicorn - ASGI server started by `backend/app/main.py`.
- Hatchling - Python build backend configured in `backend/pyproject.toml`.
- ESLint 9 + `eslint-config-next` - Frontend linting via `frontend/package.json`.
- Tailwind CSS v4 - Frontend styling dependency declared in `frontend/package.json` and wired through `frontend/components.json`.
- shadcn/ui with `radix-nova` registry style - Component scaffolding configured in `frontend/components.json`.
- React Compiler - Enabled by `reactCompiler: true` in `frontend/next.config.ts` with `babel-plugin-react-compiler` in `frontend/package.json`.
- Ruff - Python linting configured in `backend/pyproject.toml`.

## Key Dependencies

**Critical:**
- `openai` - Async LLM client used for rationale generation in `backend/app/orchestrator/rationale.py` and startup client wiring in `backend/app/data/loader.py`.
- `langchain-openai` - OpenAI embedding adapter used in `backend/app/evidence/rag_embeddings.py`.
- `chromadb` - Local persistent vector store used in `backend/app/evidence/rag_embeddings.py`.
- `langgraph` - Investigation graph runtime referenced by the orchestrator modules in `backend/app/orchestrator/`.
- `xgboost` - Claim risk model training and inference in `backend/app/ml/model.py` and `backend/app/ml/pipeline.py`.
- `shap` - Model explanation support through `backend/app/ml/explainer.py` and downstream use in `backend/app/ml/pipeline.py`.

**Infrastructure:**
- `pandas`, `polars`, `pyarrow`, `openpyxl` - File-based claims, scoring, and NCCI data processing in `backend/app/data/loader.py`, `backend/scripts/train_model.py`, `backend/scripts/score_claims.py`, and `backend/scripts/fetch_public_data.py`.
- `sse-starlette` - Server-sent event streaming helpers in `backend/app/utils/sse.py`.
- `httpx` - Async HTTP client dependency for backend development and tests from `backend/pyproject.toml`.
- `requests`, `beautifulsoup4`, `lxml`, `pypdf` - Public-source download and document parsing in `backend/scripts/fetch_public_data.py`.
- `class-variance-authority`, `clsx`, `tailwind-merge` - Frontend styling utilities used across `frontend/src/components/ui/*.tsx`.
- `radix-ui`, `lucide-react`, `motion`, `recharts`, `sonner` - Frontend component primitives, icons, animation, charts, and toast UI in `frontend/src/components/` and `frontend/src/app/layout.tsx`.

## Configuration

**Environment:**
- Backend configuration is centralized in `backend/app/config.py` and loaded from `backend/.env` through `pydantic-settings`.
- Frontend runtime origin selection is controlled by `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` in `frontend/next.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/server-api.ts`, and `frontend/src/lib/sse.ts`.
- Repo-level data paths are derived from `DATA_DIR` in `backend/app/config.py`; backend runtime expects `data/processed/`, `data/scores/`, `data/ncci/`, and `data/policy_docs/` as documented in `backend/README.md`.
- Repo-local AI workflow skills live in `.claude/skills/` and `.agents/skills/`; they are documentation/automation assets rather than runtime dependencies.

**Build:**
- `backend/pyproject.toml` - Python dependencies, Ruff, pytest, and hatchling build settings.
- `backend/uv.lock` - Locked Python dependency graph.
- `frontend/package.json` - Frontend scripts and JS dependencies.
- `frontend/bun.lock` - Locked frontend dependency graph.
- `frontend/next.config.ts` - Next.js rewrites and React Compiler enablement.
- `frontend/tsconfig.json` - TypeScript strict mode and `@/*` path alias.
- `frontend/components.json` - shadcn/ui registry and alias configuration.

## Platform Requirements

**Development:**
- Python 3.11+ and `uv` are required for `backend/` per `backend/README.md`.
- Bun is required for `frontend/` per `README.md` and `frontend/README.md`.
- Local data assets under `data/` are required for the backend to load claims, scores, NCCI edits, and policy documents via `backend/app/data/loader.py`.
- `OPENAI_API_KEY` is required for embeddings and streamed rationale generation in `backend/app/evidence/rag_embeddings.py` and `backend/app/orchestrator/rationale.py`.

**Production:**
- Not explicitly defined as a deployment target in the repo.
- Current code assumes a local split deployment: Next.js frontend at `http://localhost:3000` and FastAPI backend at `http://127.0.0.1:8000` per `README.md`, `frontend/README.md`, and `backend/README.md`.

---

*Stack analysis: 2026-04-15*

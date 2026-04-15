# External Integrations

**Analysis Date:** 2026-04-15

## APIs & External Services

**LLM and embeddings:**
- OpenAI - Used for streamed investigation rationale generation and policy-document embeddings.
  - SDK/Client: `openai`, `langchain-openai`
  - Auth: `OPENAI_API_KEY`
  - Implementation: `backend/app/orchestrator/rationale.py`, `backend/app/data/loader.py`, `backend/app/evidence/rag_embeddings.py`

**Public regulatory and policy sources:**
- CMS / HHS OIG public websites - Used to seed policy text and coding-rule data for the local evidence corpus.
  - SDK/Client: `requests`, `beautifulsoup4`, `lxml`, `pypdf`, `openpyxl`
  - Auth: None
  - Implementation: `backend/scripts/fetch_public_data.py`
- NCCI landing pages and ZIP/XLSX downloads - Used to produce `data/ncci/practitioner_ptp_edits.csv`.
  - SDK/Client: `requests`, `zipfile`, `openpyxl`
  - Auth: None
  - Implementation: `backend/scripts/fetch_public_data.py`, `backend/app/evidence/ncci_engine.py`

**Internal service boundary:**
- Next.js -> FastAPI HTTP boundary - Frontend calls `/api/*`; Next rewrites to the backend when a proxy target is available.
  - SDK/Client: native `fetch`
  - Auth: None in current implementation
  - Implementation: `frontend/next.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/server-api.ts`
- SSE investigation stream - Frontend starts investigation with `POST /api/claims/{claim_id}/investigate` and reads `text/event-stream` frames.
  - SDK/Client: `fetch` + custom SSE parser on the frontend, `sse-starlette` on the backend
  - Auth: None in current implementation
  - Implementation: `frontend/src/lib/sse.ts`, `backend/app/api/routes/investigation.py`, `backend/app/utils/sse.py`

## Data Storage

**Databases:**
- Local file-backed in-memory store
  - Connection: `DATA_DIR`
  - Client: `pandas` DataFrames loaded by `backend/app/data/loader.py`
  - Files read: `data/processed/medical_claims.parquet`, `data/processed/provider_roster.parquet`, `data/processed/anomaly_labels.parquet`, `data/scores/risk_scores.parquet`, `data/scores/model_metadata.json`, `data/ncci/practitioner_ptp_edits.csv`
  - Files written: `data/scores/investigations.parquet` from `backend/app/data/loader.py`
- Vector store: ChromaDB persistent local store
  - Connection: `CHROMA_DIR`
  - Client: `chromadb.PersistentClient`
  - Implementation: `backend/app/evidence/rag_embeddings.py`

**File Storage:**
- Local filesystem only
  - Evidence corpus: `data/policy_docs/**`
  - Public-source downloads: `data/raw/public_sources/**`
  - Generated features and scores: `data/features/**`, `data/scores/**`
  - Implementation paths: `backend/app/config.py`, `backend/scripts/fetch_public_data.py`, `backend/scripts/setup_evidence.py`, `backend/scripts/train_model.py`, `backend/scripts/score_claims.py`

**Caching:**
- None detected.

## Authentication & Identity

**Auth Provider:**
- Custom / minimal development-level access only
  - Implementation: No identity provider, session layer, or auth middleware is wired into `backend/app/main.py`, `backend/app/api/routes/*.py`, `frontend/src/lib/api.ts`, or `frontend/src/lib/sse.ts`
  - Cross-origin control is limited to `CORSMiddleware` in `backend/app/main.py`
  - Current contract docs explicitly describe auth as minimal development-level in `specs/001-claims-investigation-assistant/spec.md`

## Monitoring & Observability

**Error Tracking:**
- None detected.

**Logs:**
- Standard Python logging is used across the backend and scripts.
  - Runtime logging setup: `backend/app/main.py`
  - Script logging: `backend/scripts/setup_evidence.py`, `backend/scripts/fetch_public_data.py`, `backend/scripts/train_model.py`, `backend/scripts/score_claims.py`
- `structlog` is declared in `backend/pyproject.toml` but no active structlog wiring is detected in `backend/app/`.

## CI/CD & Deployment

**Hosting:**
- Not detected.
- The documented runtime is local development with the backend on `127.0.0.1:8000` and the frontend on `localhost:3000` in `README.md`, `backend/README.md`, and `frontend/README.md`.

**CI Pipeline:**
- None detected.

## Environment Configuration

**Required env vars:**
- `OPENAI_API_KEY` - Required for embeddings and LLM rationale in `backend/app/evidence/rag_embeddings.py` and `backend/app/orchestrator/rationale.py`
- `DATA_DIR` - Root path for claim, score, evidence, and NCCI files in `backend/app/config.py`
- `CHROMA_DIR` - Local Chroma storage path in `backend/app/config.py`
- `LLM_MODEL` - OpenAI model selection in `backend/app/config.py` and `backend/app/orchestrator/rationale.py`
- `RISK_THRESHOLD`, `HIGH_RISK_THRESHOLD` - Scoring thresholds used in `backend/app/config.py` and `backend/app/ml/pipeline.py`
- `LOG_LEVEL`, `CORS_ALLOW_ORIGINS`, `API_HOST`, `API_PORT`, `API_RELOAD` - Backend runtime configuration in `backend/app/config.py` and `backend/app/main.py`
- `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` - Frontend backend-origin selection in `frontend/next.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/server-api.ts`, and `frontend/src/lib/sse.ts`

**Secrets location:**
- Backend secrets are loaded from `backend/.env` by `backend/app/config.py`.
- Frontend runtime overrides are documented to live in `frontend/.env.local` in `frontend/README.md`.
- Example env files exist for both apps, but the runtime code reads from local env files and process env rather than from committed secrets.

## Webhooks & Callbacks

**Incoming:**
- None.
- The backend exposes REST and SSE endpoints in `backend/app/api/routes/claims.py`, `backend/app/api/routes/analytics.py`, `backend/app/api/routes/ncci.py`, and `backend/app/api/routes/investigation.py`, but no webhook receivers are implemented.

**Outgoing:**
- None.
- External traffic is limited to best-effort public-data fetches in `backend/scripts/fetch_public_data.py` and OpenAI API calls in `backend/app/orchestrator/rationale.py` and `backend/app/evidence/rag_embeddings.py`.

## Data Interfaces

**Backend REST API:**
- `GET /api/health` - Health endpoint in `backend/app/main.py`
- `GET /api/claims` and `GET /api/claims/{claim_id}` - Claim queue/detail endpoints in `backend/app/api/routes/claims.py`
- `POST /api/claims/{claim_id}/investigate`, `GET /api/claims/{claim_id}/investigation`, `PATCH /api/claims/{claim_id}/investigation`, `GET /api/claims/{claim_id}/investigation/status` - Investigation lifecycle endpoints in `backend/app/api/routes/investigation.py`
- `GET /api/analytics/overview` and `GET /api/analytics/model-performance` - Analytics endpoints in `backend/app/api/routes/analytics.py`
- `GET /api/ncci/{code_1}/{code_2}` - Direct NCCI lookup in `backend/app/api/routes/ncci.py`

**Frontend API clients:**
- Typed REST client in `frontend/src/lib/api.ts`
- Server-side backend-origin resolution in `frontend/src/lib/server-api.ts`
- Investigation SSE client in `frontend/src/lib/sse.ts`
- Search-param query adapter for queue state in `frontend/src/lib/claims-query.ts`

---

*Integration audit: 2026-04-15*

# Backend

FastAPI backend for the Claims Investigation Intelligence Assistant. The API loads synthetic and public-source claim artifacts from the repo-level `data/` directory, exposes claim and analytics endpoints, and runs the investigation workflow plus supporting evidence lookups.

## Requirements

- Python 3.11+
- `uv` installed
- Run commands from `backend/` unless noted otherwise

## Quick Start

1. Create or update the virtual environment and install dependencies:

```powershell
cd backend
uv sync --extra dev
```

2. Create a local env file if you do not already have one:

```powershell
Copy-Item .env.example .env
```

3. Start the backend:

```powershell
uv run app/main.py
```

The script now starts `uvicorn` directly. By default the API is available at `http://127.0.0.1:8000`.

Useful URLs after startup:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Health check: `http://127.0.0.1:8000/api/health`

If you prefer the explicit ASGI command:

```powershell
uv run uvicorn app.main:app --reload
```

## Why `uv run app/main.py` Was Exiting

`backend/app/main.py` originally only defined the FastAPI `app` object. Running the file as a script imported the module and exited immediately because no server process was started. The entrypoint now calls `uvicorn.run(...)` when executed directly, so `uv run app/main.py` is a valid startup command.

## Configuration

Environment variables are loaded from `backend/.env` regardless of the shell working directory.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | empty | Required for LLM-backed rationale generation. Health and deterministic routes can still start without it. |
| `DATA_DIR` | `<repo>/data` | Root directory for processed claims, scores, NCCI assets, policy docs, and ChromaDB artifacts. |
| `CHROMA_DIR` | `<repo>/data/chroma` | Vector store location for RAG evidence retrieval. |
| `LLM_MODEL` | `gpt-4o` | Model used by the rationale generation pipeline. |
| `RISK_THRESHOLD` | `40` | Medium-risk threshold used by scoring and triage logic. |
| `HIGH_RISK_THRESHOLD` | `70` | High-risk threshold used by scoring and triage logic. |
| `LOG_LEVEL` | `INFO` | Python logging level. |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins. |
| `API_HOST` | `127.0.0.1` | Host bound by `uv run app/main.py`. |
| `API_PORT` | `8000` | Port bound by `uv run app/main.py`. |
| `API_RELOAD` | `false` | Enables uvicorn reload mode when the app is started through `app/main.py`. |

## Data Expectations

The backend does not read from `backend/data`. It reads from the repo-level `data/` directory:

- `data/processed/medical_claims.parquet`
- `data/processed/provider_roster.parquet`
- `data/processed/anomaly_labels.parquet`
- `data/scores/risk_scores.parquet`
- `data/scores/model_metadata.json`
- `data/ncci/practitioner_ptp_edits.csv`
- `data/policy_docs/**`

The current repository already contains the core processed, scoring, NCCI, and policy-doc assets needed for the basic API to start.

## API Surface

Main routes:

- `GET /api/health`: basic liveness check.
- `GET /api/claims`: paginated claim list with filters for status, risk band, anomaly type, provider, and date range.
- `GET /api/claims/{claim_id}`: single claim with risk score and any saved investigation.
- `POST /api/claims/{claim_id}/investigate`: investigation SSE stream.
- `GET /api/claims/{claim_id}/investigation`: fetch a saved investigation.
- `PATCH /api/claims/{claim_id}/investigation`: submit the human decision for an investigation.
- `GET /api/claims/{claim_id}/investigation/status`: polling fallback for investigation progress.
- `GET /api/analytics/overview`: aggregate counts and anomaly distribution.
- `GET /api/analytics/model-performance`: model metrics loaded from `data/scores/model_metadata.json`.
- `GET /api/ncci/{code_1}/{code_2}?service_date=YYYY-MM-DD`: direct NCCI edit lookup.

## Development Commands

Run tests:

```powershell
uv run pytest
```

Run a targeted test file:

```powershell
uv run pytest tests/test_api.py -q
```

## Data and Model Scripts

These are optional for rebuilding or refreshing local assets.

```powershell
uv run python -m scripts.fetch_public_data
uv run python -m scripts.generate_synthetic_corpus
uv run python -m scripts.setup_evidence
uv run python -m scripts.train_model
uv run python -m scripts.score_claims
```

What each script does:

- `scripts.fetch_public_data.py`: best-effort download of CMS/OIG/NCCI public source material into `data/raw`, `data/policy_docs`, and `data/ncci`.
- `scripts.generate_synthetic_corpus.py`: backfills synthetic policy/NCCI content where public data is incomplete.
- `scripts.setup_evidence.py`: ingests policy docs into ChromaDB and validates the NCCI CSV.
- `scripts.train_model.py`: trains the XGBoost model and writes model metadata plus features.
- `scripts.score_claims.py`: scores claims and writes `data/scores/risk_scores.parquet`.

## Project Layout

```text
backend/
  app/
    api/routes/        FastAPI route modules
    data/              loaders and schemas
    evidence/          RAG and NCCI helpers
    ml/                feature engineering and model code
    orchestrator/      triage, evidence, and rationale workflow
    main.py            FastAPI app and direct-run entrypoint
    config.py          environment-backed settings
  scripts/             maintenance and data/model build scripts
  tests/               API and feature tests
```

## Troubleshooting

If the backend starts but frontend requests fail:

- If the frontend is using `NEXT_PUBLIC_API_BASE_URL` or another direct browser-to-backend setup, confirm `CORS_ALLOW_ORIGINS` includes the frontend origin.
- For the default local Next.js setup, frontend browser requests stay on `http://localhost:3000/api/...` and are proxied server-side to the backend, so a missing frontend env file is not itself a failure condition.
- Check `GET /api/health`.
- Check that the repo-level `data/` files listed above exist.
- If startup logs show `WinError 10048` or "address already in use", free the existing process on that port or set `API_PORT` to a different value in `backend/.env`.

If investigation streaming fails:

- Confirm `OPENAI_API_KEY` is set in `backend/.env`.
- Confirm `data/chroma` and `data/policy_docs` have been prepared with `scripts.setup_evidence.py`.

If model-performance returns `503`:

- Run `uv run python -m scripts.train_model` to regenerate `data/scores/model_metadata.json`.

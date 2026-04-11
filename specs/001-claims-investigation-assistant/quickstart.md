# Quickstart: Claims Investigation Intelligence Assistant

**Phase 1 Output** | Branch: `main` | Date: 2026-04-11

---

## Prerequisites

- Python 3.11+
- Node.js 18+ or Bun 1.x
- Java 11+ (for Synthea data generation)
- OpenAI API key (embeddings + LLM)

---

## 1. Clone & Configure

```bash
# From repo root
cp backend/.env.example backend/.env
# Edit backend/.env and set:
#   OPENAI_API_KEY=sk-...
#   DATA_DIR=./data
#   CHROMA_DIR=./data/chroma
```

---

## 2. Backend Setup

```bash
cd backend
pip install -e ".[dev]"
# or, if using uv:
uv sync
```

---

## 3. Generate Synthetic Data

```bash
# Step 1: Generate Synthea claims (~50K records, ~5 minutes)
python data_generation/generate_synthea.py

# Step 2: Add synthetic claim_receipt_date (lognormal lag)
python data_generation/generate_receipt_dates.py

# Step 3: Inject anomalies (train + test distributions)
python data_generation/inject_anomalies.py --split train
python data_generation/inject_anomalies.py --split test

# Step 4: Validate injection
python data_generation/validate.py
```

---

## 4. Train Model & Score Claims

```bash
# Feature engineering + XGBoost training + ablation
# Outputs: data/scores/model_metadata.json + trained model
python scripts/train_model.py

# Batch score all claims + compute SHAP values
# Outputs: data/scores/risk_scores.parquet
python scripts/score_claims.py
```

---

## 5. Index Evidence (RAG + NCCI)

```bash
# Download CMS policy docs (first run only, ~10 minutes)
# Index RAG corpus into ChromaDB
# Load NCCI practitioner PTP edits CSV
python scripts/setup_evidence.py
```

---

## 6. Run Backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Verify startup logs show:
```
INFO: Loaded 75000 claims from Parquet
INFO: Loaded 4125 risk scores
INFO: ChromaDB collection 'cms_policy' ready (N chunks)
INFO: NCCI rules engine loaded (N edits)
INFO: Application startup complete
```

API docs available at: `http://localhost:8000/docs`

---

## 7. Run Frontend

```bash
cd frontend
bun install   # or: npm install
bun run dev   # or: npm run dev
```

Open: `http://localhost:3000`

---

## 8. Verify End-to-End

1. **Dashboard** (`/`): Should show flagged claims count, risk distribution chart, anomaly type breakdown, ablation summary card. "Synthetic Data Demo" banner visible.

2. **Claims Explorer** (`/claims`): Should show filterable/sortable table. Try filtering by `risk_band=high`.

3. **Investigation** (`/claims/{id}`): Select any high-risk claim → click "Investigate" → watch SSE stream:
   - Triage result appears (~100ms)
   - Evidence cards populate (~1-2s)
   - Rationale streams in (~5-10s)
   - Total time < 15s

4. **Feedback**: Click "Accept" → verify decision is saved and claim status updates.

5. **NCCI Lookup**: `GET http://localhost:8000/api/ncci/27447/27446?service_date=2026-03-15`

---

## Running Tests

```bash
cd backend

# All tests
pytest

# Point-in-time correctness (run this first — must FAIL before feature code is written)
pytest tests/test_features.py::test_no_future_leakage -v

# NCCI engine
pytest tests/test_ncci_engine.py -v

# Orchestrator (LLM mocked)
pytest tests/test_orchestrator.py -v

# Coverage report
pytest --cov=app --cov-report=term-missing
# Target: >=80% on src/features/, src/pipeline/, src/api/
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | For embeddings and LLM |
| `DATA_DIR` | No | Path to data directory (default: `./data`) |
| `CHROMA_DIR` | No | Path to ChromaDB persistence (default: `./data/chroma`) |
| `LLM_MODEL` | No | `gpt-4o` (default) or `claude-sonnet-4-6` |
| `RISK_THRESHOLD` | No | XGBoost score threshold for flagging (default: `40`) |
| `LOG_LEVEL` | No | `INFO` (default) |

---

## Common Issues

**"No Parquet files found"**: Run `scripts/score_claims.py` before starting the backend.

**"ChromaDB collection empty"**: Run `scripts/setup_evidence.py` to index policy documents.

**SSE connection drops in browser**: Check `X-Accel-Buffering: no` header is set. If behind a proxy, ensure proxy is not buffering the response. See [contracts/sse-events.md](./contracts/sse-events.md) for polling fallback.

**SHAP assertion failure**: Verify XGBoost model version matches requirements. `TreeExplainer` must be used (not `Explainer`).

# Payment Integrity Claims Intelligence Platform — Design Specification

## 1. Problem Statement

Healthcare payers lose over $100B annually to improper payments (GAO, 2023). Payment integrity teams currently rely on fragmented, siloed workflows — manually cross-referencing claims against clinical records, policy rules, and coding guidelines — to identify and investigate suspicious claims. This process is slow, inconsistent, and scales poorly.

This project builds an **AI-powered Payment Integrity Claims Intelligence Platform** that combines classical ML-based anomaly detection with agentic GenAI to automatically flag suspicious claims, retrieve relevant policy evidence, and generate audit-ready investigation rationales — reducing manual investigation time by an estimated 40-60% while improving consistency and defensibility.

### 1.1 Why Payment Integrity?

- **Abacus Insights' #1 product vertical** by AI automation potential (30-55% estimated efficiency gain)
- Strategic priority evidenced by the recent Abacus-CoverSelf partnership
- Documents identify "manual reconciliation", "siloed workflows", and "fragmented data" as explicit pain points
- The vertical has the strongest combination of data volume, repeatability, and direct workflow leverage

### 1.2 Scope Boundaries

**In scope:**
- Claims anomaly detection ML pipeline (ingestion -> feature engineering -> scoring)
- RAG system over CMS policy documents and coding guidelines
- Multi-agent investigation workflow (triage -> evidence retrieval -> rationale generation)
- Interactive dashboard with claim explorer, risk scoring, evidence trails, and investigator chat
- Evaluation metrics and efficiency benchmarking
- Designed for Abacus data plug-in (medallion-compatible schema, configurable connectors)

**Out of scope:**
- Real PHI/PII data handling or HIPAA-compliant deployment
- Integration with actual claims adjudication systems
- Pre-pay real-time decisioning (this focuses on post-pay investigation)
- Provider communication and dispute management
- Production-grade authentication/authorization

### 1.3 Success Metrics

| Metric | Target |
|---|---|
| ML anomaly detection AUC-ROC | > 0.85 |
| RAG retrieval precision on policy evidence | > 80% |
| Agentic rationale coherence (manual eval on 50 samples) | > 85% rated "useful" |
| End-to-end latency: claim -> flag -> rationale | < 30 seconds |
| UI completeness | Fully interactive dashboard with all core flows |
| Demo readiness | Live walkthrough-ready with compelling narrative |

---

## 2. Data Strategy

### 2.1 Synthetic Claims Data

**Primary source: Synthea**
Generate ~50K-100K synthetic patient records producing realistic claims histories including:
- Medical claims (inpatient, outpatient, professional)
- Pharmacy claims
- Member eligibility and enrollment
- Provider roster with specialties and NPI numbers

**Supplementary: CMS Public Use Files**
Medicare provider utilization and payment data from CMS.gov to calibrate realistic charge distributions, procedure frequencies, and provider billing patterns.

### 2.2 Injected Anomaly Patterns

Since Synthea produces "clean" data, programmatically inject realistic fraud/waste/abuse patterns at a ~5-8% overall rate with ground-truth labels:

| Pattern | Description | Injection Method | Rate |
|---|---|---|---|
| **Upcoding** | Procedure codes shifted to higher-paying variants within same family | Replace CPT codes with higher-level codes in same category | ~1.5% |
| **Unbundling** | Bundled procedures split into separate claims | Split single bundled claim into 2-3 component claims | ~1% |
| **Duplicate billing** | Same service billed multiple times with slight date/modifier variations | Clone claims with +-1 day offset and minor modifier changes | ~1% |
| **Phantom services** | Services billed with no matching diagnosis context | Insert procedure claims with unrelated or missing diagnosis codes | ~0.8% |
| **Impossible combinations** | Mutually exclusive procedures on same date | Pair conflicting procedure codes per NCCI edit rules | ~0.7% |
| **Provider outliers** | Statistically abnormal billing volumes or charge patterns | Select ~2% of providers, inflate their claim volume by 3-5x | ~1% |

Each injected anomaly gets a label record: `(claim_id, anomaly_type, injection_params)` for supervised training and evaluation.

### 2.3 Policy & Rules Knowledge Base (RAG Corpus)

| Source | Content | Availability |
|---|---|---|
| CMS Medicare Claims Processing Manual | ~20 chapters covering billing rules, code requirements, coverage decisions | Public (cms.gov) |
| CMS National Correct Coding Initiative (NCCI) Edits | Code pair conflicts, bundling rules, mutually exclusive procedures | Public (cms.gov) |
| ICD-10-CM / CPT Coding Guidelines | Diagnosis and procedure code relationships, coding conventions | Public (CMS/AMA summaries) |
| CMS Fraud, Waste & Abuse Guidelines | Definitions, examples, investigation procedures | Public (cms.gov) |

Documents will be chunked, embedded, and indexed for hybrid retrieval (semantic + keyword).

### 2.4 Data Schema

Designed to mirror Abacus's medallion architecture (Silver/Gold layer) for seamless future plug-in:

```
data/
├── raw/                          # Synthea output (Bronze equivalent)
│   ├── patients.csv
│   ├── encounters.csv
│   ├── claims.csv
│   └── providers.csv
│
├── processed/                    # Feature-engineered (Silver/Gold equivalent)
│   ├── medical_claims.parquet    # claim_id, member_id, provider_id, service_date,
│   │                             # procedure_codes, diagnosis_codes, charge_amount,
│   │                             # allowed_amount, paid_amount, place_of_service
│   ├── pharmacy_claims.parquet   # rx_number, NDC, quantity, days_supply, ingredient_cost
│   ├── member_eligibility.parquet # member_id, plan_id, enrollment_dates, demographics
│   ├── provider_roster.parquet   # provider_id, NPI, specialty, facility_type, network_status
│   └── anomaly_labels.parquet    # claim_id, anomaly_type, anomaly_subtype, injection_params
│
├── features/                     # ML-ready feature tables (SAM equivalent)
│   ├── claim_features.parquet    # Per-claim feature vectors
│   ├── provider_features.parquet # Aggregated provider-level statistics
│   └── member_features.parquet   # Aggregated member-level patterns
│
└── policy_docs/                  # RAG corpus
    ├── cms_claims_manual/        # Chunked markdown files
    ├── ncci_edits/               # Structured code-pair rules (CSV + descriptions)
    └── coding_guidelines/        # ICD-10/CPT reference material
```

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐  │
│  │  Dashboard   │  │ Claim Detail │  │ Investi-  │  │ Analytics │  │
│  │  Overview    │  │ & Evidence   │  │ gation    │  │ & Metrics │  │
│  │             │  │  Trail       │  │ Chat      │  │           │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  └─────┬─────┘  │
└─────────┼────────────────┼────────────────┼───────────────┼────────┘
          │                │                │               │
          ▼                ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API LAYER (FastAPI)                            │
│  /claims  /claims/{id}/investigate  /chat  /analytics  /pipeline   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌─────────────────┐
│   ML PIPELINE    │ │ AGENTIC LAYER│ │   RAG SYSTEM    │
│                  │ │              │ │                 │
│ Feature Engine   │ │ Triage Agent │ │ Doc Chunker     │
│ Anomaly Detector │ │ Evidence     │ │ Embedding Store │
│ Risk Scorer      │ │   Agent      │ │ Hybrid Retriever│
│ Explainer        │ │ Rationale    │ │                 │
│                  │ │   Agent      │ │                 │
│                  │ │ Orchestrator │ │                 │
└────────┬─────────┘ └──────┬───────┘ └────────┬────────┘
         │                  │                   │
         ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                    │
│  Synthetic Claims (Parquet)  │  Policy Docs (ChromaDB)  │  SQLite  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 + Tailwind CSS + shadcn/ui | Modern, fast, great component library |
| **API** | FastAPI (Python) | Async, fast, auto-docs, ML-ecosystem native |
| **ML Pipeline** | scikit-learn, XGBoost, SHAP | Industry-standard, explainable, fast iteration |
| **RAG System** | ChromaDB + LangChain | Lightweight vector store, no infra overhead |
| **Embeddings** | OpenAI `text-embedding-3-small` | Cost-effective, high quality |
| **LLM** | OpenAI GPT-4o or Anthropic Claude Sonnet | Best balance of quality/speed/cost for agents |
| **Agentic Framework** | LangGraph | Stateful multi-agent orchestration with built-in checkpoints |
| **Data Processing** | Pandas + Polars | Fast local processing; Spark-compatible patterns |
| **Storage** | Parquet files + SQLite + ChromaDB | Zero-infra, portable, production-pattern-compatible |
| **Data Generation** | Synthea + custom Python injectors | Realistic synthetic healthcare data |

### 3.3 Why This Stack Is Abacus-Ready

- **Parquet + medallion schema** mirrors Abacus's Databricks lakehouse directly
- **FastAPI** is a standard Python backend — trivially containerized for cloud deployment
- **ChromaDB** can be swapped for Databricks Vector Search in production
- **LangGraph agents** are model-agnostic — swap OpenAI for Azure OpenAI (Abacus's likely provider)
- **Feature engineering in Pandas/Polars** uses patterns directly portable to PySpark

---

## 4. ML Pipeline — Anomaly Detection & Risk Scoring

### 4.1 Feature Engineering

Three levels of features, each progressively more powerful:

**Claim-Level Features (per claim):**
- `charge_amount`, `allowed_amount`, `paid_amount`, `charge_to_allowed_ratio`
- `num_procedure_codes`, `num_diagnosis_codes`, `num_modifiers`
- `days_between_service_and_submission`
- `place_of_service_encoded`
- `procedure_complexity_score` (derived from CPT hierarchy)
- `diagnosis_procedure_coherence_score` (embedding similarity between diagnosis and procedure descriptions)

**Provider-Level Features (aggregated per provider, joined to claims):**
- `provider_avg_charge`, `provider_claim_volume_30d`, `provider_specialty_charge_percentile`
- `provider_unique_patients_30d`, `provider_denial_rate_historical`
- `provider_procedure_concentration` (HHI of procedure code distribution)
- `provider_peer_deviation` (z-score vs. same-specialty peers)

**Member-Level Features (aggregated per member, joined to claims):**
- `member_claim_frequency_90d`, `member_unique_providers_90d`
- `member_avg_charge`, `member_chronic_condition_count`
- `member_historical_anomaly_rate`

### 4.2 Model Architecture — Ensemble Approach

```
                    ┌─────────────────┐
                    │  Input Features  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Isolation    │ │   XGBoost    │ │  Autoencoder │
    │  Forest       │ │  Classifier  │ │  (recon.     │
    │ (unsupervised)│ │ (supervised) │ │   error)     │
    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
           │                │                │
           ▼                ▼                ▼
    ┌─────────────────────────────────────────────┐
    │         Ensemble Meta-Learner               │
    │   (Weighted average with learned weights)    │
    └─────────────────────┬───────────────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  Risk Score     │
                 │  (0-100) +      │
                 │  SHAP values    │
                 └─────────────────┘
```

**Why three models:**
- **Isolation Forest** catches novel anomalies that don't match known patterns (unsupervised — no labels needed)
- **XGBoost** leverages the injected anomaly labels for high-precision detection of known fraud types (supervised)
- **Autoencoder** learns normal claim distributions and flags high reconstruction error (semi-supervised, catches subtle deviations)

The ensemble meta-learner combines all three, weighted by validation performance. This gives you the best of both worlds: catching known patterns AND novel anomalies.

### 4.3 Explainability (SHAP)

Every risk score comes with SHAP feature attributions, answering "why was this claim flagged?":
- Top 5 contributing features per claim
- Feature importance rendered as a waterfall chart in the UI
- Natural language summary generated by the LLM from SHAP values (e.g., "This claim was flagged primarily because the charge amount ($8,450) is 3.2 standard deviations above the provider's peer group average for this procedure, and the diagnosis-procedure coherence score is unusually low.")

### 4.4 Model Training & Evaluation

**Train/validation/test split:** 70/15/15, stratified by anomaly type to ensure all patterns are represented.

**Evaluation metrics:**
- AUC-ROC (primary — target > 0.85)
- Precision-Recall curve (critical for imbalanced data — fraud is rare)
- Precision@K (how many of the top K flagged claims are actual anomalies)
- Per-anomaly-type recall (can we detect each pattern?)

**Model registry:** Simple versioned model storage (joblib serialization + metadata JSON) — mimics MLflow patterns without the infrastructure overhead.

---

## 5. RAG System — Policy Intelligence

### 5.1 Document Processing Pipeline

```
Raw Policy PDFs/HTML
        │
        ▼
┌──────────────────┐
│  Document Parser  │  (markitdown / PyPDF2 / BeautifulSoup)
│  → clean markdown │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Semantic Chunker │  (split by section headers + paragraph boundaries)
│  ~500 tokens/chunk│  (with 50-token overlap)
│  + metadata tags  │  (source, chapter, section, topic, code_references)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Embedding        │  (OpenAI text-embedding-3-small)
│  + Index          │  (ChromaDB persistent collection)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  NCCI Rules Index │  (Structured: code_pair → rule, stored separately)
│  (CSV → lookup)   │  (Direct lookup, not vector search)
└──────────────────┘
```

### 5.2 Hybrid Retrieval Strategy

Not all lookups are semantic — the system uses the right retrieval method per query type:

| Query Type | Retrieval Method | Example |
|---|---|---|
| "What does CMS policy say about billing for X?" | Semantic vector search (top-5 chunks) | Open-ended policy questions |
| "Are CPT 27447 and 27446 allowed on same day?" | Direct NCCI edit lookup (structured) | Code pair conflict checks |
| "What are the rules for modifier -59?" | Hybrid: keyword filter on "modifier 59" + semantic ranking | Specific rule lookups |
| "Show me relevant fraud indicators for upcoding" | Semantic search with metadata filter (topic=fraud) | Category-level policy retrieval |

### 5.3 Retrieval Quality

- **Reranking:** After initial retrieval, a cross-encoder reranker (or LLM-based reranker) selects the most relevant chunks
- **Citation tracking:** Every chunk carries source metadata (document, page, section) — all agent outputs cite their sources
- **Evaluation:** Build a small golden set (~50 question-answer pairs from policy docs) to measure retrieval precision/recall

---

## 6. Agentic Layer — Multi-Agent Investigation

### 6.1 Agent Architecture (LangGraph)

```
┌──────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (LangGraph)                    │
│                                                                │
│   ┌─────────┐     ┌──────────┐     ┌────────────┐            │
│   │ TRIAGE  │────▶│ EVIDENCE │────▶│ RATIONALE  │            │
│   │ AGENT   │     │ AGENT    │     │ AGENT      │            │
│   └─────────┘     └──────────┘     └────────────┘            │
│        │               │                │                     │
│        ▼               ▼                ▼                     │
│   Classifies      Retrieves        Generates                 │
│   anomaly type,   policy rules,    audit-ready               │
│   sets priority,  NCCI edits,      rationale with            │
│   determines      coding context,  citations and             │
│   investigation   historical       recommended               │
│   path            patterns         actions                   │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │              SHARED STATE (LangGraph State)          │    │
│   │  claim_data, risk_score, shap_values, anomaly_type,  │    │
│   │  evidence_chunks, policy_citations, rationale,       │    │
│   │  investigation_status, human_feedback                │    │
│   └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Agent Specifications

**Triage Agent**
- **Input:** Claim data + ML risk score + SHAP feature attributions
- **Task:** Classify the suspected anomaly type (upcoding, unbundling, duplicate, phantom, impossible combo, provider outlier), assign investigation priority (Critical/High/Medium/Low), and determine which evidence paths to pursue
- **Output:** `{anomaly_type, confidence, priority, investigation_plan}`
- **LLM prompt strategy:** Few-shot examples of each anomaly type with SHAP patterns that characterize them

**Evidence Agent**
- **Input:** Triage output + claim details (procedure codes, diagnosis codes, provider info)
- **Task:** Query the RAG system for relevant policy rules. For code-pair issues, perform NCCI edit lookups. Retrieve historical patterns for the provider/member. Compile all evidence into a structured evidence package.
- **Output:** `{policy_citations[], ncci_findings[], historical_context, evidence_summary}`
- **Tools available:** `search_policy_docs()`, `lookup_ncci_edits()`, `get_provider_history()`, `get_member_history()`

**Rationale Agent**
- **Input:** Full investigation state (claim + triage + evidence)
- **Task:** Synthesize all findings into a coherent, audit-ready investigation rationale. Must cite specific policy sections. Must include: summary of findings, supporting evidence, policy basis, recommended action, and confidence level.
- **Output:** `{rationale_text, citations[], recommended_action, confidence, review_needed}`
- **Guardrails:** Must cite at least 2 policy sources. Must not recommend a final determination — always recommends human review for final decision. Confidence score must reflect evidence strength.

### 6.3 Orchestration Flow

```
1. Claim flagged by ML pipeline (risk_score > threshold)
         │
         ▼
2. Triage Agent classifies and prioritizes
         │
         ├── If confidence < 0.5 → route to human immediately
         │
         ▼
3. Evidence Agent gathers policy rules and historical context
         │
         ├── If contradictory evidence found → flag for human review
         │
         ▼
4. Rationale Agent generates audit-ready narrative
         │
         ▼
5. Result stored with full evidence chain
         │
         ▼
6. Investigator reviews in UI, provides feedback (accept/reject/modify)
         │
         ▼
7. Feedback stored for continuous improvement
```

### 6.4 Human-in-the-Loop Design

The system is designed as an **investigation assistant**, not an autonomous decision-maker:
- All flagged claims require human review before any action
- Investigators can accept, reject, or modify the AI's rationale
- Rejection feedback is stored and can be used to improve prompts/models
- The UI clearly marks AI-generated content vs. human-confirmed decisions
- Confidence scores are transparent — low-confidence findings are visually distinguished

---

## 7. API Design (FastAPI)

### 7.1 Core Endpoints

```
# Claims & Investigation
GET    /api/claims                        # List claims with filters (status, risk, date, provider)
GET    /api/claims/{claim_id}             # Get claim details + features + risk score
POST   /api/claims/{claim_id}/investigate # Trigger agentic investigation pipeline
GET    /api/claims/{claim_id}/investigation # Get investigation results
PATCH  /api/claims/{claim_id}/investigation # Investigator feedback (accept/reject/modify)

# Chat (Investigation Assistant)
POST   /api/chat                          # Send message in investigation context
       body: { claim_id?, message, conversation_id }
       response: SSE stream of agent response

# Analytics & Metrics
GET    /api/analytics/overview            # Dashboard summary stats
GET    /api/analytics/model-performance   # ML model metrics (AUC, precision, recall)
GET    /api/analytics/anomaly-distribution # Breakdown by anomaly type
GET    /api/analytics/provider-risk       # Provider-level risk rankings
GET    /api/analytics/efficiency          # Investigation time metrics (simulated)

# Pipeline Management
POST   /api/pipeline/run                  # Trigger ML pipeline re-run
GET    /api/pipeline/status               # Pipeline health and last run info

# RAG / Knowledge Base
GET    /api/knowledge/search              # Direct policy document search
GET    /api/knowledge/ncci/{code_pair}    # NCCI edit lookup
```

### 7.2 Response Patterns

All endpoints follow consistent response envelopes:

```json
{
  "data": { ... },
  "metadata": {
    "timestamp": "2026-04-09T10:30:00Z",
    "processing_time_ms": 245
  }
}
```

Investigation results include full provenance:

```json
{
  "data": {
    "claim_id": "CLM-2026-00482",
    "risk_score": 87,
    "anomaly_type": "upcoding",
    "triage": {
      "priority": "high",
      "confidence": 0.92,
      "investigation_plan": "..."
    },
    "evidence": {
      "policy_citations": [
        {
          "text": "...",
          "source": "CMS Claims Processing Manual, Ch. 23, Sec 30.1",
          "relevance_score": 0.94
        }
      ],
      "ncci_findings": [...],
      "historical_context": "..."
    },
    "rationale": {
      "text": "This claim for CPT 27447 (total knee replacement) submitted by Dr. Smith shows indicators consistent with upcoding...",
      "citations": ["CMS-CPM-23-30.1", "NCCI-2024-Q3-27447"],
      "recommended_action": "Refer for clinical review",
      "confidence": 0.88,
      "review_needed": true
    },
    "status": "pending_review",
    "investigator_feedback": null
  }
}
```

---

## 8. Frontend Design (Next.js)

### 8.1 Page Structure

```
/                           → Dashboard (overview metrics, risk distribution, recent flags)
/claims                     → Claims Explorer (filterable table, risk heatmap)
/claims/[id]                → Claim Detail (risk breakdown, SHAP waterfall, evidence trail)
/claims/[id]/investigation  → Investigation View (agent results, rationale, feedback form)
/chat                       → Investigation Chat (conversational claim investigation)
/analytics                  → Model Performance & Efficiency Metrics
/knowledge                  → Knowledge Base Explorer (search policy docs, browse NCCI)
```

### 8.2 Dashboard Overview

The main dashboard provides at-a-glance situational awareness:

- **KPI Cards:** Total claims processed, flagged count, investigation rate, avg risk score, estimated savings
- **Risk Distribution Chart:** Histogram of risk scores across all claims
- **Anomaly Type Breakdown:** Donut chart showing flagged claims by category (upcoding, unbundling, etc.)
- **Top Flagged Claims Table:** Sortable table with claim ID, risk score, anomaly type, status, and quick-investigate action
- **Provider Risk Heatmap:** Top providers by aggregate risk score
- **Trend Line:** Flags over time (simulated for demo)

### 8.3 Claim Detail & Investigation View

When an investigator clicks into a claim:

**Left panel — Claim Facts:**
- Member demographics, provider info, service details
- Procedure and diagnosis codes with descriptions
- Charge breakdown (billed vs. allowed vs. paid)

**Center panel — AI Investigation:**
- Risk score gauge (0-100) with color coding
- SHAP waterfall chart showing top contributing features
- Anomaly type classification with confidence
- AI-generated rationale (markdown with inline citations)
- Linked policy evidence (expandable cards with source snippets)
- NCCI edit findings (if applicable)

**Right panel — Actions:**
- Accept / Reject / Modify buttons
- Free-text feedback field
- Investigation history timeline
- "Ask a question" quick-chat launcher

### 8.4 Investigation Chat

A conversational interface where investigators can ask follow-up questions about any claim:

- Claim context is automatically loaded
- Supports questions like:
  - "Why is this claim's charge so much higher than the average?"
  - "What does CMS policy say about billing 27447 and 27446 together?"
  - "Show me this provider's billing history for the last 6 months"
  - "Are there other similar claims from this provider?"
- Responses include citations and can reference SHAP values, policy docs, and historical data
- Conversation history is persisted per claim

### 8.5 UI Design Principles

- **Dark professional theme** — appropriate for a healthcare analytics tool, not a consumer app
- **Data-dense but scannable** — leverage tables, cards, and charts; minimize empty space
- **Clear AI attribution** — all AI-generated content has a subtle visual marker and "AI Generated" label
- **Citation-forward** — every AI claim links to its source; investigators can click through to the full policy text
- **Responsive** — works on desktop (primary) and tablet

---

## 9. Project Structure

```
payment-integrity-ai/
│
├── README.md
├── docker-compose.yml              # One-command local setup
├── .env.example                    # Required API keys template
│
├── backend/
│   ├── pyproject.toml              # Python dependencies (Poetry/uv)
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # Settings and environment config
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── claims.py       # Claims CRUD + investigation triggers
│   │   │   │   ├── chat.py         # SSE streaming chat endpoint
│   │   │   │   ├── analytics.py    # Dashboard metrics
│   │   │   │   ├── pipeline.py     # ML pipeline management
│   │   │   │   └── knowledge.py    # RAG search + NCCI lookup
│   │   │   └── dependencies.py     # Shared dependencies (DB, agents, etc.)
│   │   │
│   │   ├── ml/
│   │   │   ├── features.py         # Feature engineering logic
│   │   │   ├── models.py           # Model training (IF, XGBoost, Autoencoder)
│   │   │   ├── ensemble.py         # Ensemble meta-learner
│   │   │   ├── explainer.py        # SHAP explanation generation
│   │   │   └── pipeline.py         # End-to-end training + scoring pipeline
│   │   │
│   │   ├── rag/
│   │   │   ├── ingest.py           # Document parsing + chunking
│   │   │   ├── embeddings.py       # Embedding generation + ChromaDB indexing
│   │   │   ├── retriever.py        # Hybrid retrieval (semantic + keyword + NCCI)
│   │   │   └── reranker.py         # Cross-encoder reranking
│   │   │
│   │   ├── agents/
│   │   │   ├── orchestrator.py     # LangGraph workflow definition
│   │   │   ├── triage.py           # Triage agent
│   │   │   ├── evidence.py         # Evidence retrieval agent
│   │   │   ├── rationale.py        # Rationale generation agent
│   │   │   ├── chat_agent.py       # Conversational investigation agent
│   │   │   ├── prompts/            # Prompt templates (versioned)
│   │   │   │   ├── triage.md
│   │   │   │   ├── evidence.md
│   │   │   │   ├── rationale.md
│   │   │   │   └── chat.md
│   │   │   └── tools.py            # Agent tool definitions
│   │   │
│   │   ├── db/
│   │   │   ├── database.py         # SQLite connection + session management
│   │   │   ├── models.py           # SQLAlchemy ORM models
│   │   │   └── seed.py             # Initial data loading
│   │   │
│   │   └── utils/
│   │       └── schemas.py          # Pydantic request/response models
│   │
│   ├── data_generation/
│   │   ├── generate_synthea.py     # Synthea runner + output processor
│   │   ├── inject_anomalies.py     # Anomaly injection logic
│   │   ├── calibrate.py            # CMS public data calibration
│   │   └── validate.py             # Data quality checks on generated data
│   │
│   ├── scripts/
│   │   ├── setup_rag.py            # One-time RAG corpus ingestion
│   │   ├── train_models.py         # Model training script
│   │   └── seed_database.py        # Load processed data into SQLite
│   │
│   └── tests/
│       ├── test_features.py
│       ├── test_models.py
│       ├── test_retriever.py
│       ├── test_agents.py
│       └── test_api.py
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx          # Root layout (dark theme, nav)
│   │   │   ├── page.tsx            # Dashboard
│   │   │   ├── claims/
│   │   │   │   ├── page.tsx        # Claims explorer
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx    # Claim detail + investigation
│   │   │   ├── chat/
│   │   │   │   └── page.tsx        # Investigation chat
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx        # Model metrics & efficiency
│   │   │   └── knowledge/
│   │   │       └── page.tsx        # Knowledge base explorer
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui base components
│   │   │   ├── dashboard/          # Dashboard-specific components
│   │   │   ├── claims/             # Claims table, filters, detail cards
│   │   │   ├── investigation/      # Risk gauge, SHAP chart, rationale display
│   │   │   ├── chat/               # Chat interface components
│   │   │   └── charts/             # Recharts wrappers (risk distribution, trends)
│   │   │
│   │   └── lib/
│   │       ├── api.ts              # API client (fetch wrappers)
│   │       └── types.ts            # TypeScript interfaces
│   │
│   └── public/
│       └── ...                     # Static assets
│
└── docs/
    ├── architecture.md             # This design doc (condensed)
    └── presentation/               # Demo script and slide content
```

---

## 10. End-to-End Data Flow

### 10.1 Batch Pipeline (Data Ingestion → ML Scoring)

```
1. Synthea generates raw patient/claims data
   │
2. inject_anomalies.py adds fraud patterns with ground truth labels
   │
3. Feature engineering computes claim/provider/member features
   │
4. Ensemble model scores every claim (risk 0-100)
   │
5. Claims + scores + features loaded into SQLite
   │
6. High-risk claims (score > configurable threshold) marked as "needs_investigation"
```

### 10.2 On-Demand Investigation (User-Triggered)

```
1. Investigator clicks "Investigate" on a flagged claim
   │
2. FastAPI triggers LangGraph orchestrator
   │
3. Triage Agent: classifies anomaly type, sets priority
   │
4. Evidence Agent: queries RAG for policy rules, checks NCCI edits,
   │                pulls provider/member history
   │
5. Rationale Agent: synthesizes audit-ready narrative with citations
   │
6. Results returned via API, rendered in UI
   │
7. Investigator reviews, provides feedback
   │
8. Feedback persisted for model/prompt improvement
```

### 10.3 Chat Flow (Conversational Investigation)

```
1. Investigator opens chat (optionally in context of a specific claim)
   │
2. Message sent to /api/chat (SSE stream)
   │
3. Chat agent receives message + claim context + conversation history
   │
4. Agent decides which tools to use:
   │  - search_policy_docs() for policy questions
   │  - lookup_ncci_edits() for code pair queries
   │  - get_claim_details() for claim-specific data
   │  - get_provider_history() for provider patterns
   │  - explain_risk_score() for SHAP-based explanations
   │
5. Response streamed back with citations
```

---

## 11. Testing Strategy

### 11.1 Unit Tests
- Feature engineering: verify correct computation of each feature
- Anomaly injection: verify each pattern is injected correctly
- RAG chunking: verify document parsing and chunk boundaries
- NCCI lookup: verify correct code-pair rule retrieval
- Agent prompts: verify prompt formatting with sample inputs

### 11.2 Integration Tests
- ML pipeline end-to-end: raw data → features → model → scores
- RAG pipeline: document → chunks → embeddings → retrieval → relevant results
- Agent pipeline: claim → triage → evidence → rationale (mock LLM for speed)
- API endpoints: request → response validation

### 11.3 Evaluation Tests
- ML model performance: AUC-ROC, precision-recall, per-anomaly-type recall
- RAG retrieval quality: precision@5 on golden question set
- Agent rationale quality: manual evaluation rubric on 50 sample claims
- End-to-end latency: measure claim → rationale pipeline timing

### 11.4 Frontend Tests
- Component rendering (React Testing Library)
- API integration (MSW mock service worker)
- Key user flows (Playwright for critical paths: dashboard → claim → investigate → feedback)

---

## 12. Demo Narrative & Presentation Strategy

### 12.1 The Story Arc

The demo follows a Payment Integrity investigator's workflow:

1. **Open Dashboard** — "Here's your morning view. 847 claims processed overnight. 52 flagged for investigation. Estimated recoverable amount: $1.2M."

2. **Explore Flagged Claims** — "Let's sort by risk score. This claim stands out — risk score 94, suspected upcoding from an orthopedic provider."

3. **Trigger Investigation** — "One click to investigate. Watch the AI work: triaging... gathering policy evidence... generating rationale... done in 12 seconds."

4. **Review AI Rationale** — "The system found that this knee replacement claim (CPT 27447) was billed at $14,200 — 3.1x the specialty average. It cites CMS Claims Processing Manual Chapter 23, Section 30.1 and identified 7 similar claims from this provider in the last quarter."

5. **Ask Follow-Up Questions** — "Let me open the investigation chat: 'Are these two procedure codes allowed on the same date?' The AI checks NCCI edits and responds with a citation."

6. **Show Model Performance** — "Our ensemble model achieves AUC 0.91. Here's the precision-recall curve, and here's the per-anomaly-type breakdown."

7. **The Abacus Connection** — "This runs on synthetic data today. But the schema mirrors Abacus's medallion architecture exactly. Swap the data source, point ChromaDB at Databricks Vector Search, and this is production-ready for Abacus's Payment Integrity solution."

### 12.2 Key Talking Points for Corporate Audience

- **$100B problem** — improper payments are massive; even small % improvements are worth millions
- **Not replacing investigators — amplifying them** — AI does the tedious evidence gathering; humans make decisions
- **Auditable and explainable** — every AI output cites its sources; SHAP shows why the model flagged a claim
- **Production-architecture-ready** — medallion schema, containerized backend, model registry patterns
- **Measurable ROI** — show efficiency metrics: time-to-investigate reduced from ~45 min to ~5 min (simulated benchmark)

---

## 13. Implementation Phases (3-4 Weeks)

### Week 1: Foundation
- Set up project structure, Docker, CI
- Generate synthetic data with Synthea + anomaly injection
- Build feature engineering pipeline
- Train and evaluate ML models (Isolation Forest + XGBoost + Autoencoder ensemble)
- Basic FastAPI skeleton with claims endpoints

### Week 2: Intelligence Layer
- Build RAG pipeline (document ingestion, chunking, embedding, ChromaDB)
- Implement NCCI edit lookup
- Build LangGraph agents (triage, evidence, rationale)
- Wire up investigation API endpoints
- Begin frontend scaffolding (Next.js + dashboard layout)

### Week 3: Frontend & Integration
- Complete dashboard, claims explorer, claim detail views
- Build investigation view with SHAP visualization
- Implement chat interface with SSE streaming
- Build analytics page with model performance charts
- End-to-end integration testing

### Week 4: Polish & Presentation
- UI polish, responsive design, loading states, error handling
- Demo data curation (pick the most compelling examples)
- Performance optimization (caching, lazy loading)
- Write documentation and architecture overview
- Prepare presentation deck and demo script
- Rehearse live demo

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM API costs during development | Medium | Use GPT-4o-mini for iteration, GPT-4o/Claude for demo only |
| Synthea data doesn't look realistic enough | Medium | Calibrate with CMS public statistics; curate demo subset |
| Agent responses are inconsistent | High | Structured output parsing, few-shot prompts, temperature=0 for reproducibility |
| RAG retrieves irrelevant chunks | High | Hybrid retrieval + reranking + golden set evaluation before demo |
| Scope creep into pre-pay / real-time | Low | Hard scope boundary in this doc; post-pay investigation only |
| 3-4 weeks is tight for this scope | Medium | Prioritize: ML + agents + core UI first; chat and analytics are stretch |
| Frontend complexity slows progress | Medium | Lean on shadcn/ui heavily; avoid custom components where possible |

---

## 15. Future Extensibility (Talking Points, Not Implementation)

These are discussion points for the presentation — things the platform *could* do if deployed at Abacus:

- **Pre-pay integration:** Move anomaly detection upstream into the claims adjudication pipeline for real-time flagging
- **Feedback loop:** Investigator accept/reject decisions retrain the ML models continuously
- **Provider profiling:** Long-term provider risk scoring across the entire book of business
- **Multi-payer patterns:** Cross-client anonymized pattern detection (network-level fraud rings)
- **Regulatory update agent:** Automatically re-index policy docs when CMS publishes updates, flag impacted investigation rationales
- **Databricks native:** Run the ML pipeline as Databricks jobs, use Unity Catalog for governance, Vector Search for RAG

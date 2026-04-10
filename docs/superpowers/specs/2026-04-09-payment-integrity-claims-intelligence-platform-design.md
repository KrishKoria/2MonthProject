# Claims Investigation Intelligence Assistant — Design Specification (V1)

> **V1 scope — revised for 4-week solo feasibility after adversarial review (GPT-5.4), architectural critique, and external scope feedback.** Every component in this spec earns its place. Nothing is included for breadth alone. Changelog from earlier revisions is in the Appendix.

---

## 1. Problem Statement

Healthcare payers lose over $100B annually to improper payments (GAO, 2023). Payment integrity teams rely on fragmented, manual workflows — cross-referencing claims against policy rules and coding guidelines — to investigate suspicious claims. This is slow, inconsistent, and scales poorly.

This project builds an **AI-powered Claims Investigation Intelligence Assistant** that combines deterministic billing-rule checks, ML-based risk scoring with faithful explanations, evidence retrieval from public CMS policy, and LLM-synthesized investigation rationales — demonstrating how AI can reduce manual first-pass investigation effort while keeping humans in the loop.

### 1.1 Why Payment Integrity?

- **A high-priority Abacus product vertical** with significant AI automation potential — evidenced by the Abacus-CoverSelf partnership and explicit internal emphasis on payment integrity workflows
- Documents identify "manual reconciliation", "siloed workflows", and "fragmented data" as explicit pain points
- Strongest combination of data volume, repeatability, and direct workflow leverage

> **Note on business framing:** Do not state specific efficiency percentages (e.g., "30-55% gain") in the presentation unless you have a citable source. A specific unsourced number is the easiest thing for an experienced audience to challenge, and it weakens surrounding credibility. "Significant efficiency potential" or "meaningful reduction in manual first-pass investigation effort" is honest and unchallengeable.

### 1.2 Domain Scope: Medicare Part B Professional Claims

Intentionally narrowed to **Medicare Part B professional claims** — the cleanest fit with publicly available CMS assets (NCCI practitioner edits, CMS Claims Processing Manual, HCPCS descriptions). This is not a general payment integrity platform. It is a focused investigation assistant for a specific, well-defined claims universe where the public policy corpus can actually support decision-relevant evidence retrieval.

### 1.3 Scope Boundaries

**In scope:**

- Claims anomaly detection ML pipeline (ingestion → feature engineering → scoring) for Medicare Part B professional claims
- Deterministic rules baseline with ablation proving ML adds incremental value
- XGBoost risk scoring with SHAP TreeExplainer for faithful per-claim explanations
- NCCI rules engine with simplified structured lookups (deterministic, not RAG)
- RAG system over public CMS policy documents for explanatory evidence and citations
- LangGraph investigation orchestrator: deterministic triage and evidence gathering, LLM-powered rationale synthesis
- SSE streaming of investigation pipeline steps to frontend
- Interactive dashboard with claims explorer, claim detail, and investigation workflow
- Human-in-the-loop actions (accept / reject / escalate)
- Evaluation metrics with honest synthetic-data framing
- Designed with Abacus-compatible patterns (medallion schema, Parquet-native)

**Out of scope:**

- Real PHI/PII data handling or HIPAA-compliant deployment
- Integration with actual claims adjudication systems
- Pre-pay real-time decisioning (this focuses on post-pay investigation)
- Provider communication and dispute management
- Production-grade authentication/authorization
- Full CPT coding guidelines (AMA-copyrighted)
- NCDs, LCDs, or payer-specific coverage policies
- Embedded conversational chat (v2 — investigation rationale is sufficient for v1)
- Full NCCI modifier-bypass logic (v2 — simplified conflict check for v1)
- Isolation Forest / secondary anomaly model (v2 — one model done right over two done halfway)
- Full analytics product (v1 includes a small ablation section only)

### 1.4 Success Metrics

| Metric | Target | Notes |
|---|---|---|
| XGBoost AUC-ROC on synthetic data | > 0.85 | Grouped temporal split; framed as capability demo |
| XGBoost lift over rules baseline | Measurable | Ablation proves ML adds value beyond deterministic checks |
| RAG retrieval precision on policy evidence | > 80% | On golden eval set of Medicare Part B policy questions |
| Agentic rationale coherence (manual eval on 50 samples) | > 85% rated "useful" | Human evaluation rubric |
| End-to-end latency: click investigate → full rationale | < 15 seconds | Deterministic steps <2s, LLM synthesis streamed |
| UI completeness | Fully interactive with core investigation flow | Dashboard → claims → investigate → feedback |
| Demo readiness | Live walkthrough-ready with compelling narrative | Honest about synthetic data and limitations |

### 1.5 Honest Framing & Limitations

This project is a **capability demonstration**, not a production fraud detector. Limitations acknowledged upfront:

- **Synthetic data**: All ML metrics are on Synthea-generated data with programmatically injected anomalies. Model performance on real payer claims would differ.
- **Narrow policy corpus**: Only publicly available CMS material is indexed. Production use would require AMA CPT guidelines, LCD/NCD databases, and payer-specific policies.
- **Injected anomalies**: The ML model detects patterns we injected, based on real fraud typologies but not a substitute for real-world improper payment distributions. CMS notes most improper payments stem from documentation and medical-necessity issues, not just coding anomalies.
- **Investigation-support, not audit-ready**: AI rationales support human investigation. They are not legally defensible audit determinations.

What IS demonstrated: production-architecture patterns, end-to-end ML + GenAI pipeline, explainable AI, human-in-the-loop design, and domain-grounded evidence retrieval.

### 1.6 Architectural Philosophy

Every component earns its place through a clear, non-redundant role:

| Component | Why it exists | Why this implementation |
|---|---|---|
| **Rules baseline** | Proves ML adds value beyond obvious checks | Deterministic — no model needed for known violations |
| **XGBoost** | Detects subtle pattern combinations rules miss | Best supervised model for tabular data; SHAP TreeExplainer gives exact explanations |
| **SHAP** | Makes ML trustworthy to investigators | TreeExplainer is mathematically faithful for tree models — not an approximation |
| **NCCI rules engine** | Code-pair adjudication needs structured logic | Deterministic lookup — RAG would be wrong tool for structured data |
| **RAG** | Investigation rationales need policy citations | Explanatory text retrieval — right tool for unstructured policy documents |
| **LangGraph orchestrator** | Multi-step investigation needs typed state and observability | Deterministic nodes where possible, LLM only for synthesis |
| **SSE streaming** | Investigation takes seconds; user needs progressive feedback | Trivial with one LLM call; shows async patterns |
| **Parquet + medallion** | Abacus runs on Databricks lakehouse | Same schema patterns, directly portable |

---

## 2. Data Strategy

### 2.1 Synthetic Claims Data

**Primary source: Synthea**
Generate ~50K-100K synthetic patient records producing realistic Medicare Part B professional claims histories including:

- Professional claims (office visits, procedures, specialist consultations)
- Member eligibility and enrollment
- Provider roster with specialties and NPI numbers

**Synthetic claim_receipt_date generation:**
Real healthcare claims have significant lag between service and submission. Synthea does not model this. We generate a synthetic `claim_receipt_date` per claim:

- Distribution: lognormal with median ~14 days, 90th percentile ~45 days (calibrated to CMS claims lag statistics)
- This is the temporal anchor for all point-in-time feature aggregations — NOT `service_date`
- Rationale: in production pipelines, features available at decision time depend on when claims arrive, not when services occurred. Using `service_date` would create temporal leakage.

**Supplementary: CMS Public Use Files**
Medicare provider utilization and payment data from CMS.gov to calibrate realistic charge distributions, procedure frequencies, and provider billing patterns.

### 2.2 Injected Anomaly Patterns

Narrowed to **3 anomaly types** that the public policy corpus can actually support with decision-relevant evidence:

| Pattern | Description | Injection Method | Rate | Policy Basis |
|---|---|---|---|---|
| **Upcoding** | Procedure codes shifted to higher-paying variants within same family | Replace CPT codes with higher-level codes in same category | ~2% | CMS Claims Processing Manual billing rules |
| **NCCI Code-Pair Violations** | Procedures billed together that violate NCCI edit rules | Pair conflicting procedure codes per NCCI practitioner PTP edits | ~2% | NCCI PTP edits (structured rules) |
| **Duplicate Billing** | Same service billed multiple times with slight date variations | Clone claims with +-1 day offset and minor modifier changes | ~1.5% | CMS Claims Processing Manual duplicate billing rules |

Total anomaly rate: ~5.5%. Each injected anomaly gets a label record: `(claim_id, anomaly_type, injection_params)`.

**Injection Distribution Partitioning (Train vs. Test):**

To prevent XGBoost from memorizing the injection function, anomaly injection uses **different parameter distributions** for train and test data:

| Anomaly Type | Train Distribution | Test Distribution (Holdout) |
|---|---|---|
| Upcoding | Shift by exactly 1 CPT level within category | Shift by 2 levels, or cross-category shifts |
| NCCI Violations | Top 50 most common conflicting code pairs | Next 50 code pairs (different but structurally similar) |
| Duplicate Billing | Clone with +-1 day offset | Clone with +-2-3 day offset and different modifier patterns |

This means the ablation metric measures **generalization to unseen anomaly variants**, not memorization of injection logic.

**Why only 3 types:** These 3 have direct, verifiable policy backing in public CMS material. Other types (phantom services, provider outliers) lack sufficient policy grounding for evidence-based rationales.

### 2.3 Policy & Rules Knowledge Base

**Two distinct systems — architecturally separated because they solve different problems:**

**A. NCCI Rules Engine (Structured Lookup, NOT RAG):**

| Asset | Content | Format | Update Cadence |
|---|---|---|---|
| NCCI Practitioner PTP Edits | Code-pair conflicts, mutually exclusive procedures | CSV with code_1, code_2, effective_date, deletion_date, modifier_indicator | Quarterly (CMS.gov) |

For v1, this is a **simplified conflict-exists check**: given two procedure codes and a service date, does an active NCCI edit exist? The full modifier-bypass logic (modifier_indicator=0/1/9, -59/-XE/-XS/-XP/-XU checking) is explicitly scoped for v2. The v1 lookup returns: `{conflict_exists: bool, edit_type, effective_date}`. The presentation acknowledges this simplification and shows where modifier logic plugs in.

**B. RAG Corpus (Explanatory Policy Text):**

| Source | Content | Availability | Scope |
|---|---|---|---|
| CMS Medicare Claims Processing Manual | Selected chapters relevant to Part B professional billing (Ch. 12, Ch. 23, Ch. 26) | Public (cms.gov) | Narrowed to Part B professional |
| HCPCS Code Descriptions | Procedure code descriptions and categories | Public (cms.gov) | Full HCPCS Level II |
| CMS Fraud, Waste & Abuse Guidelines | Definitions, examples, investigation procedures | Public (cms.gov) | General |

RAG is used **only for explanatory text** — helping the rationale synthesis cite specific policy language. It does NOT adjudicate code-pair validity (that's the NCCI rules engine).

### 2.4 Data Schema

Follows medallion architecture patterns for Abacus data compatibility:

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
│   │                             # claim_receipt_date (synthetic lag),
│   │                             # procedure_codes, diagnosis_codes, modifiers,
│   │                             # charge_amount, allowed_amount, paid_amount,
│   │                             # place_of_service
│   ├── member_eligibility.parquet
│   ├── provider_roster.parquet
│   └── anomaly_labels.parquet    # claim_id, anomaly_type, anomaly_subtype, injection_params
│
├── features/                     # ML-ready feature tables (SAM equivalent)
│   ├── claim_features.parquet    # Per-claim feature vectors (point-in-time)
│   └── provider_features.parquet # Aggregated provider-level statistics (point-in-time)
│
├── scores/                       # Model outputs
│   ├── risk_scores.parquet       # claim_id, xgboost_score, shap_values, rules_flags
│   └── model_metadata.json       # Training params, eval metrics, ablation results
│
├── ncci/                         # Structured rules (NOT in RAG)
│   ├── practitioner_ptp_edits.csv
│   └── ncci_metadata.json
│
└── policy_docs/                  # RAG corpus
    ├── cms_claims_manual/        # Selected chapters, chunked markdown
    ├── hcpcs_descriptions/
    └── fraud_guidelines/
```

**Why Parquet, not SQLite:** For a prototype processing <100K claims, Parquet loaded into memory at FastAPI startup is simpler, faster, and more architecturally honest than adding an ORM layer. Parquet is also the native format for Abacus's Databricks lakehouse — so the schema is directly portable.

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                         │
│  ┌───────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Dashboard  │  │   Claims     │  │  Claim Detail +        │   │
│  │ Overview   │  │   Explorer   │  │  Investigation View    │   │
│  └─────┬─────┘  └──────┬──────┘  └───────────┬────────────┘   │
└────────┼───────────────┼──────────────────────┼────────────────┘
         │               │                      │
         ▼               ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API LAYER (FastAPI)                           │
│  /claims  /claims/{id}/investigate (SSE)  /analytics            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  ML PIPELINE   │ │  INVESTIGATION   │ │ EVIDENCE SYSTEMS │
│  (offline)     │ │  ORCHESTRATOR    │ │                  │
│                │ │  (LangGraph)     │ │ NCCI Rules Engine│
│ Feature Engine │ │                  │ │ (structured)     │
│ XGBoost Scorer │ │ Triage (determ.) │ │                  │
│ SHAP Explainer │ │ Evidence (determ)│ │ RAG Retriever    │
│ Rules Baseline │ │ Rationale (LLM)  │ │ (CMS policy text)│
└───────┬────────┘ └──────┬───────────┘ └────────┬─────────┘
        │                 │                       │
        ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                   │
│       Claims (Parquet, in-memory)  │  NCCI (CSV)  │             │
│       Scores (Parquet)             │  Policy (ChromaDB)         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 + Tailwind CSS + shadcn/ui | Modern, fast, great component library |
| **API** | FastAPI (Python) | Async, fast, auto-docs, ML-ecosystem native |
| **ML Pipeline** | scikit-learn, XGBoost, SHAP | Industry-standard, explainable, fast iteration |
| **NCCI Rules Engine** | Pandas/custom Python | Structured lookups — no model needed |
| **RAG System** | ChromaDB + LangChain | Lightweight vector store, no infra overhead |
| **Embeddings** | OpenAI `text-embedding-3-small` | Cost-effective, high quality |
| **LLM** | OpenAI GPT-4o or Anthropic Claude Sonnet | Best balance of quality/speed/cost for rationale synthesis |
| **Orchestrator** | LangGraph | Typed state, observable nodes, conditional edges |
| **Data Processing** | Pandas + Polars | Fast local processing; Spark-compatible patterns |
| **Storage** | Parquet files (in-memory at runtime) + ChromaDB | Zero-infra, portable, Abacus-compatible format |
| **Data Generation** | Synthea + custom Python injectors | Synthetic healthcare data |

### 3.3 Abacus-Compatible Patterns

These are **architecture patterns**, not production-ready integrations:

- **Parquet + medallion schema** mirrors Abacus's Databricks lakehouse layout
- **FastAPI** is trivially containerized for cloud deployment
- **ChromaDB** follows the same API pattern as Databricks Vector Search
- **LangGraph orchestrator** is model-agnostic — swap OpenAI for Azure OpenAI
- **Feature engineering in Pandas/Polars** uses patterns directly portable to PySpark

---

## 4. ML Pipeline — Anomaly Detection & Risk Scoring

### 4.1 Feature Engineering

All features computed **point-in-time** using strict lookback windows anchored to `claim_receipt_date` (not `service_date`). For each claim, aggregate features only use claims whose `claim_receipt_date` is strictly before the current claim's `claim_receipt_date`.

**Claim-Level Features (per claim):**

- `charge_amount`, `allowed_amount`, `paid_amount`, `charge_to_allowed_ratio`
- `num_procedure_codes`, `num_diagnosis_codes`, `num_modifiers`
- `days_between_service_and_submission`
- `place_of_service_encoded`
- `procedure_complexity_score` (derived from CPT/HCPCS hierarchy)
- `has_ncci_conflict` (binary: does this claim contain a conflicting code pair in NCCI?)
- `modifier_count`, `modifier_59_present` (modifier usage patterns)

**Provider-Level Features (point-in-time, joined to claims):**

- `provider_avg_charge_30d`, `provider_claim_volume_30d`, `provider_specialty_charge_percentile`
- `provider_unique_patients_30d`
- `provider_procedure_concentration` (HHI of procedure code distribution)
- `provider_peer_deviation` (z-score vs. same-specialty peers in lookback window)
- All windows based on `claim_receipt_date`

**Member-Level Features (point-in-time, joined to claims):**

- `member_claim_frequency_90d`, `member_unique_providers_90d`
- `member_avg_charge_90d`, `member_chronic_condition_count`
- All windows based on `claim_receipt_date`

**Implementation warning — three ways this goes silently wrong:**

Point-in-time correctness is architecturally correct in the spec but easy to implement incorrectly. The danger: leakage bugs don't crash the pipeline — they silently inflate model metrics. AUC might read 0.93 instead of 0.85 and you would have no indication that features are contaminated.

**Bug A — Off-by-one in the temporal filter (use `<`, not `<=`):**
```python
# Wrong — current claim included in its own aggregate window:
provider_claims = all_claims[all_claims['claim_receipt_date'] <= target_date]

# Correct:
provider_claims = all_claims[all_claims['claim_receipt_date'] < target_date]
```

**Bug B — Compute-then-join (the most common mistake, looks natural in Pandas):**
```python
# Wrong — computes avg_charge over ALL time then joins; contaminates every row with future data:
provider_avg = claims.groupby('provider_id')['charge_amount'].mean()
claims = claims.merge(provider_avg, on='provider_id')

# Correct — for each claim, aggregate only from claims with earlier claim_receipt_date:
# Requires a temporal join or explicit per-claim window computation
```

**Bug C — Using the wrong date column for the lookback window:**
```python
# Wrong — service_date ignores submission lag; future-received claims can appear in window:
window = all_claims[all_claims['service_date'] >= target_date - timedelta(days=30)]

# Correct — always use claim_receipt_date for all temporal boundaries:
window = all_claims[
    (all_claims['claim_receipt_date'] >= target_date - timedelta(days=30)) &
    (all_claims['claim_receipt_date'] < target_date)
]
```

**Required: Write the correctness test BEFORE writing feature code.**

This is the highest-leverage test in the project. Write it first, watch it fail, then make it pass:

```python
def test_no_future_leakage():
    """
    Create 3 claims for the same provider:
      - Claim A: claim_receipt_date = day 1
      - Claim B: claim_receipt_date = day 5
      - Claim C: claim_receipt_date = day 10
    Features computed for Claim B should see only Claim A.
    Claim C must not appear in Claim B's lookback window.
    """
    features_B = compute_provider_features(claim_B, all_claims, lookback_days=30)
    assert features_B['provider_claim_volume_30d'] == 1  # only Claim A visible
    # If this returns 2, Claim C leaked into Claim B's window — fix the filter
```

If this test does not exist before the model is trained, you cannot know whether your evaluation metrics are honest.

### 4.2 Model: XGBoost

**One model, done right.**

XGBoost is the primary and only ML model in v1. Rationale:

- Best-in-class for tabular data with mixed feature types
- SHAP `TreeExplainer` provides **exact** (not approximate) feature attributions
- Fast training and inference — no GPU required
- One model with faithful explanations is architecturally cleaner than two models with ambiguous display logic

**Output:** Risk score (0-100) + per-feature SHAP values for every scored claim. Scores and SHAP values are persisted to `scores/risk_scores.parquet` during batch scoring.

### 4.3 Rules Baseline & Ablation

A **deterministic rules baseline** proves the ML model adds value beyond simple checks:

```
Rules baseline:
  - Flag claims with NCCI code-pair conflict (active edit exists for claim's code pair)
  - Flag claims where charge > 2x specialty average
  - Flag claims with exact-duplicate (same provider, member, procedure, +-1 day)
```

**Ablation comparison (shown in analytics section):**

| Method | What it catches |
|---|---|
| Rules baseline | Obvious violations detectable by deterministic checks |
| XGBoost | Pattern combinations rules miss (subtle upcoding within same category, volume patterns, multi-feature interactions) |
| Rules + XGBoost | Full detection — rules catch the obvious, ML catches the subtle |

If XGBoost doesn't beat the rules baseline on the holdout set (which uses different anomaly distributions), that's an honest finding worth reporting.

### 4.4 Explainability (SHAP)

SHAP `TreeExplainer` on XGBoost provides **faithful, exact feature attributions**:

- Top 5 contributing features per claim
- Feature importance rendered as a waterfall chart in the UI
- Natural language summary generated from SHAP values by the rationale synthesis step (e.g., "This claim was flagged primarily because the charge amount ($8,450) is 3.2 standard deviations above the provider's peer group average for this procedure.")

SHAP explains the XGBoost score faithfully. `TreeExplainer` computes exact Shapley values for tree models — not a post-hoc approximation.

### 4.5 Model Training & Evaluation

**Grouped temporal split:**

1. Sort all claims by `claim_receipt_date`
2. Split temporally: first 70% of receipt dates → train, next 15% → validation, last 15% → test
3. Within each split, ensure no `provider_id` appears in both train and test (grouped split)
4. This prevents both temporal leakage and provider-level information leakage
5. **Injection distribution partitioning**: train set uses train-distribution anomaly parameters; test set uses holdout-distribution parameters (§2.2)

**Point-in-time feature construction:** All aggregate features computed using only claims whose `claim_receipt_date` is strictly before the target claim's `claim_receipt_date`. No future information leaks into features.

**Evaluation metrics:**

- AUC-ROC (primary — target > 0.85 on synthetic data)
- Precision-Recall curve (critical for imbalanced data)
- Precision@K (how many of the top K flagged claims are actual anomalies)
- Per-anomaly-type recall (can we detect each of the 3 patterns?)
- **Ablation vs. rules baseline** (lift metric — what does XGBoost add?)

All metrics are explicitly framed as **performance on synthetic data with injected anomalies**.

---

## 5. Evidence Systems

### 5.1 NCCI Rules Engine (Structured, Not RAG)

```
Query: (code_1=27447, code_2=27446, date=2026-03-15)
  │
  ▼
┌──────────────────────────────────────┐
│  NCCI Practitioner PTP Lookup (v1)   │
│  1. Find matching code pair          │
│  2. Check effective_date range       │
│  3. Return: conflict exists or not   │
│     + edit type + effective date      │
└──────────────────────────────────────┘
```

V1 is a **simplified conflict-exists check**. Returns: `{code_pair, conflict_exists: bool, edit_type, effective_date, rationale}`.

**V2 extension point (documented, not built):** Full modifier-bypass logic — modifier_indicator field determines whether modifiers (-59, -XE/-XS/-XP/-XU) can override the edit. The CSV already contains this data; the logic to interpret it is scoped for v2.

### 5.2 RAG System (CMS Policy Text)

**Document Processing:**

```
CMS Manual PDFs/HTML → Document Parser (markitdown/PyPDF2)
  → Semantic Chunker (~500 tokens, 50-token overlap)
  → Metadata tags (source, chapter, section, topic)
  → OpenAI text-embedding-3-small → ChromaDB
```

**Retrieval Strategy:**

| Query Type | Method |
|---|---|
| "What does CMS say about billing for X?" | Semantic vector search (top-5 chunks) |
| "What are the rules for modifier -59?" | Keyword filter + semantic ranking |
| "Fraud indicators for upcoding" | Semantic search with metadata filter (topic=fraud) |

**Quality controls:**

- Citation tracking: every chunk carries source metadata (document, chapter, section)
- Golden evaluation set: ~50 question-answer pairs from CMS manual chapters, measuring precision@5
- If basic retrieval proves insufficient, add LLM-based reranking (not pre-committed)

### 5.3 What's NOT in the Evidence System

Explicitly excluded (and acknowledged in the demo):

- AMA CPT Professional Edition guidelines (copyrighted)
- NCDs and LCDs (local coverage decisions)
- Payer-specific medical policies
- Clinical documentation / medical records

The architecture is **extensible** — these sources plug into the same retrieval interface. The demo acknowledges where they would go.

---

## 6. Investigation Orchestrator (LangGraph)

### 6.1 Architecture: Mostly-Deterministic Pipeline with LLM Synthesis

```
┌──────────────────────────────────────────────────────────────────┐
│            INVESTIGATION ORCHESTRATOR (LangGraph)                 │
│                                                                   │
│   ┌─────────────┐    ┌──────────────────┐    ┌──────────────┐   │
│   │   TRIAGE     │───▶│   EVIDENCE       │───▶│  RATIONALE   │   │
│   │ (deterministic)   │ (deterministic)  │    │  (LLM)       │   │
│   │   <100ms     │    │   <2s            │    │  streamed    │   │
│   └─────────────┘    └──────────────────┘    └──────────────┘   │
│         │                    │                       │           │
│    Python logic         Tool execution          One LLM call    │
│    No LLM needed        No LLM needed          via SSE stream   │
│                                                                   │
│         ┌────────────── CONDITIONAL ──────────────┐              │
│         │  If evidence payload empty → HALT        │              │
│         │  "Manual Review Required"                │              │
│         └─────────────────────────────────────────┘              │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              TYPED STATE (LangGraph State)               │   │
│   │  claim_data, xgboost_score, shap_values, rules_flags,   │   │
│   │  anomaly_type, evidence_tools, evidence_results,         │   │
│   │  rationale, investigation_status                         │   │
│   └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Why this architecture:**

LLMs are used **only** for rationale synthesis — the one step that genuinely requires natural language generation. Triage (classification + routing) and evidence gathering (tool execution) are deterministic because they don't need an LLM: the routing logic is a function of XGBoost/SHAP/rules outputs, and evidence tools return structured data.

This is architecturally stronger than 3 LLM agents because:
- Deterministic steps are fast (<2s total), reliable, and unit-testable
- One LLM failure point instead of three
- LangGraph still provides typed state, observable nodes, and conditional edges
- The presentation story is better: "LLMs where they add value, deterministic logic everywhere else"

### 6.2 Node Specifications

**Triage Node — Deterministic Classification + Routing**

- **Input:** Claim data + XGBoost risk score + SHAP top features + rules flags
- **Logic (Python, no LLM):**
  - If `has_ncci_conflict` flag is set → `anomaly_type = "ncci_violation"`, tools = `[ncci_lookup, policy_search]`
  - If rules duplicate flag is set → `anomaly_type = "duplicate"`, tools = `[duplicate_search, policy_search]`
  - Else if high XGBoost score with charge/peer-deviation features dominant in SHAP → `anomaly_type = "upcoding"`, tools = `[policy_search, provider_history]`
  - If XGBoost score < threshold and no rules flags → `status = "low_risk"`, skip investigation
- **Output:** `{anomaly_type, confidence, priority, evidence_tools_to_use[]}`
- **Why deterministic:** Routing is a function of model outputs and rules flags. An LLM would add latency and non-determinism for a task that has clear decision boundaries.

**Evidence Node — Deterministic Tool Execution**

- **Input:** Triage output + claim details
- **Logic:** Execute the tools specified by triage. Compile results.
- **Tools available:**
  - `lookup_ncci_conflict(code_1, code_2, date)` → NCCI rules engine (structured result)
  - `search_policy_docs(query, filters)` → RAG retrieval (top-5 chunks with citations)
  - `get_provider_history(provider_id, lookback_days)` → provider billing patterns from Parquet
  - `get_claim_duplicates(member_id, procedure_code, date_range)` → potential duplicate claims
- **Output:** `{policy_citations[], ncci_findings, provider_context, duplicate_matches[], evidence_summary}`
- **Conditional edge:** If evidence payload is empty or all tools return no results → halt with `{status: "manual_review_required", reason: "insufficient_evidence"}`. Do NOT invoke rationale synthesis on empty context.

**Rationale Node — LLM Synthesis (Single Call, Streamed)**

- **Input:** Full investigation state (claim + triage + evidence + SHAP explanation)
- **Task:** Synthesize all findings into a coherent investigation-support rationale. Cite specific policy sections. Include: summary, supporting evidence, policy basis, recommended next step, confidence level.
- **Implementation:** Single LLM call with structured prompt containing all evidence. Response streamed via SSE to frontend.
- **Output:** `{rationale_text, citations[], recommended_action, confidence, review_needed}`
- **Guardrails:** Must cite evidence actually found (not hallucinate sources). Must not recommend a final determination. Confidence must reflect evidence strength. Strict JSON output schema enforced.
- **Why one call is sufficient:** By the time the rationale node runs, all evidence is already gathered. The LLM's job is synthesis, not multi-hop reasoning. One well-prompted call with complete context produces better results than a chain of partial-context calls.

### 6.3 Orchestration Flow

```
1. Claim has XGBoost score > threshold OR rules flag
         │
         ▼
2. Triage node (deterministic, <100ms):
   classifies anomaly type + selects evidence tools
         │
         ├── If low confidence → mark "needs manual triage", skip automation
         │
         ▼
3. Evidence node (deterministic, <2s):
   executes tools, compiles evidence package
         │
         ├── If evidence empty → HALT: "Manual Review Required"
         │
         ▼
4. Rationale node (LLM, streamed ~5-10s):
   synthesizes investigation rationale with citations
         │
         ▼
5. Result stored with full evidence chain + all node outputs visible in UI
         │
         ▼
6. Investigator reviews, provides feedback (accept/reject/escalate)
```

### 6.4 Human-in-the-Loop Design

The system is an **investigation assistant**, not an autonomous decision-maker:

- All flagged claims require human review before any action
- Investigators can accept, reject, or escalate the AI's rationale
- Feedback is stored for future improvement
- The UI clearly marks AI-generated content vs. human-confirmed decisions
- Confidence scores are transparent — low-confidence findings are visually distinguished
- Every orchestrator node's output is visible in the UI (triage → evidence → rationale)

---

## 7. API Design (FastAPI)

### 7.1 Core Endpoints

```
# Claims
GET    /api/claims                          # List claims with filters (status, risk, date, provider)
GET    /api/claims/{claim_id}               # Claim details + features + scores + SHAP values

# Investigation (SSE stream)
POST   /api/claims/{claim_id}/investigate   # Trigger investigation orchestrator
       response: SSE stream of pipeline steps:
         event: triage    → {anomaly_type, confidence, priority, evidence_tools}
         event: evidence  → {policy_citations[], ncci_findings, provider_context}
         event: rationale → streamed text chunks with citations
         event: complete  → full investigation result
         event: halt      → {reason: "insufficient_evidence", manual_review: true}
GET    /api/claims/{claim_id}/investigation # Get stored investigation results
PATCH  /api/claims/{claim_id}/investigation # Investigator feedback (accept/reject/escalate)

# Analytics (precomputed)
GET    /api/analytics/overview              # Dashboard summary stats
GET    /api/analytics/model-performance     # ML metrics + rules baseline ablation

# NCCI Lookup
GET    /api/ncci/{code_1}/{code_2}          # Direct NCCI conflict check
       query params: service_date
```

### 7.2 SSE Implementation Notes

SSE is straightforward in FastAPI via `sse-starlette`, but it sits at the backend/frontend integration seam and the demo depends on it. These are the failure modes to handle explicitly:

**Required headers (missing these causes silent browser-side failures):**
```python
# FastAPI SSE response must include:
headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",       # prevents nginx from buffering the stream
    "Access-Control-Allow-Origin": "*"  # required for cross-origin SSE from Next.js dev server
}
```

**LLM failure mid-stream (handle explicitly, do not let the connection break silently):**
```python
async def investigation_stream(claim_id: str):
    try:
        triage = run_triage(claim_id)
        yield {"event": "triage", "data": triage.json()}

        evidence = run_evidence(claim_id, triage)
        if not evidence:
            yield {"event": "halt", "data": json.dumps({"reason": "insufficient_evidence"})}
            return
        yield {"event": "evidence", "data": evidence.json()}

        async for chunk in llm.astream(build_rationale_prompt(triage, evidence)):
            yield {"event": "rationale_chunk", "data": chunk}

        yield {"event": "complete", "data": full_result.json()}

    except Exception as e:
        # Always emit an error event rather than letting the connection die
        yield {"event": "error", "data": json.dumps({"message": str(e)})}
```

**Fallback plan if SSE proves unreliable during Week 3:**
If SSE causes persistent issues (connection drops, buffering, CORS), replace with polling:
- Backend runs investigation async and stores intermediate states to Parquet/dict in memory
- Frontend polls `GET /api/claims/{id}/investigation/status` every 500ms
- Response includes a `status` field: `triage_complete`, `evidence_complete`, `rationale_complete`
- Frontend renders each section as status advances

From the demo audience's view, the UX looks nearly identical. Build SSE properly but have this fallback designed in your head from day one.

**Build SSE in Week 2**, not Week 3. If it has integration issues, you need time to diagnose or fall back. Leaving SSE to Week 3 makes it a demo-blocker.

### 7.3 Response Patterns

All endpoints follow consistent response envelopes:

```json
{
  "data": { ... },
  "metadata": {
    "timestamp": "2026-04-09T10:30:00Z",
    "processing_time_ms": 245,
    "data_source": "synthetic"
  }
}
```

Investigation results include full provenance:

```json
{
  "data": {
    "claim_id": "CLM-2026-00482",
    "xgboost_risk_score": 87,
    "rules_flags": ["charge_outlier"],
    "triage": {
      "anomaly_type": "upcoding",
      "priority": "high",
      "confidence": 0.92,
      "evidence_tools_used": ["search_policy_docs", "get_provider_history"]
    },
    "evidence": {
      "policy_citations": [
        {
          "text": "...",
          "source": "CMS Claims Processing Manual, Ch. 12, Sec 30.6.1",
          "relevance_score": 0.94
        }
      ],
      "ncci_findings": null,
      "provider_context": "Provider bills CPT 27447 at 3.1x specialty average..."
    },
    "rationale": {
      "text": "This claim shows indicators consistent with upcoding...",
      "citations": ["CMS-CPM-12-30.6.1"],
      "recommended_action": "Refer for clinical review",
      "confidence": 0.88,
      "review_needed": true
    },
    "status": "pending_review"
  }
}
```

---

## 8. Frontend Design (Next.js)

### 8.1 Page Structure

```
/                    → Dashboard (overview metrics, risk distribution, recent flags)
/claims              → Claims Explorer (filterable table, risk heatmap)
/claims/[id]         → Claim Detail + Investigation View
```

Three pages. Each one polished and stable.

**Cut from scope:** `/analytics` as a separate page (ablation chart is embedded in dashboard), `/chat` (v2), `/knowledge` (v2).

### 8.2 Dashboard Overview

At-a-glance situational awareness:

- **KPI Cards:** Total claims processed, flagged count, investigation rate, avg risk score
- **Risk Distribution Chart:** Histogram of XGBoost risk scores
- **Anomaly Type Breakdown:** Donut chart — upcoding vs. NCCI violations vs. duplicates
- **Top Flagged Claims Table:** Sortable, with quick-investigate action
- **Ablation Summary:** Small card or chart showing rules baseline vs. XGBoost lift
- **Synthetic Data Banner:** Persistent, subtle banner reminding viewers this is demo data

### 8.3 Claim Detail & Investigation View

The core workflow screen — the non-negotiable centerpiece.

**Left panel — Claim Facts:**

- Member demographics, provider info, service details
- Procedure and diagnosis codes with HCPCS descriptions
- Charge breakdown (billed vs. allowed vs. paid)

**Center panel — AI Investigation:**

- XGBoost risk score (0-100) with SHAP waterfall chart
- Rules flags displayed (NCCI conflict, charge outlier, duplicate)
- **Progressive rendering of orchestrator steps** (SSE-driven):
  1. Triage result appears instantly (~100ms) — anomaly type, confidence, evidence tools selected
  2. Evidence cards populate (~1-2s) — policy citations, NCCI findings, provider context
  3. Rationale streams in (~5-10s) — narrative with inline citations, progressive text appearance
  4. If evidence insufficient → "Manual Review Required" state (no hallucinated rationale)
- The progressive experience makes the pipeline visible and engaging during the LLM synthesis step

**Right panel — Actions:**

- Accept / Reject / Escalate buttons
- Free-text feedback field
- Investigation history timeline

### 8.4 UI Design Principles

- **Dark professional theme** — appropriate for a healthcare analytics tool
- **Data-dense but scannable** — tables, cards, charts; minimize empty space
- **Clear AI attribution** — all AI-generated content has "AI Generated" label
- **Citation-forward** — every AI claim links to its source
- **Honest framing** — "Synthetic Data Demo" badge visible on all data-dependent views

---

## 9. Project Structure

```
payment-integrity-ai/
│
├── README.md
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                  # FastAPI app, Parquet loading at startup
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── claims.py
│   │   │   │   ├── investigation.py  # SSE streaming investigation endpoint
│   │   │   │   ├── analytics.py
│   │   │   │   └── ncci.py
│   │   │   └── dependencies.py
│   │   │
│   │   ├── ml/
│   │   │   ├── features.py           # Point-in-time feature engineering
│   │   │   ├── model.py              # XGBoost training + scoring
│   │   │   ├── rules_baseline.py     # Deterministic rules for ablation
│   │   │   ├── explainer.py          # SHAP TreeExplainer
│   │   │   └── pipeline.py           # End-to-end training + batch scoring
│   │   │
│   │   ├── evidence/
│   │   │   ├── ncci_engine.py        # Simplified NCCI conflict lookup
│   │   │   ├── rag_ingest.py         # Document parsing + chunking
│   │   │   ├── rag_embeddings.py     # Embedding generation + ChromaDB
│   │   │   └── rag_retriever.py      # Semantic retrieval for policy text
│   │   │
│   │   ├── orchestrator/
│   │   │   ├── graph.py              # LangGraph definition + state schema
│   │   │   ├── triage.py             # Deterministic classification + routing
│   │   │   ├── evidence.py           # Deterministic tool execution
│   │   │   ├── rationale.py          # LLM synthesis (single call)
│   │   │   ├── prompts/
│   │   │   │   └── rationale.md      # One prompt, well-crafted
│   │   │   └── tools.py              # Tool definitions for evidence node
│   │   │
│   │   ├── data/
│   │   │   ├── loader.py             # Parquet → in-memory DataFrames at startup
│   │   │   └── schemas.py            # Pydantic models for all data contracts
│   │   │
│   │   └── utils/
│   │       └── sse.py                # SSE streaming helpers
│   │
│   ├── data_generation/
│   │   ├── generate_synthea.py
│   │   ├── inject_anomalies.py       # 3 anomaly types, distribution partitioning
│   │   ├── generate_receipt_dates.py  # Lognormal lag from service_date
│   │   ├── calibrate.py
│   │   └── validate.py
│   │
│   ├── scripts/
│   │   ├── setup_evidence.py         # RAG ingestion + NCCI data load
│   │   ├── train_model.py            # XGBoost training + eval + ablation
│   │   └── score_claims.py           # Batch scoring + SHAP computation
│   │
│   └── tests/
│       ├── test_features.py          # Point-in-time correctness
│       ├── test_model.py
│       ├── test_rules_baseline.py
│       ├── test_ncci_engine.py
│       ├── test_retriever.py
│       ├── test_orchestrator.py       # Triage routing logic, halt condition
│       └── test_api.py
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Dashboard
│   │   │   └── claims/
│   │   │       ├── page.tsx          # Claims explorer
│   │   │       └── [id]/
│   │   │           └── page.tsx      # Claim detail + investigation
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui base components
│   │   │   ├── dashboard/
│   │   │   ├── claims/
│   │   │   ├── investigation/        # Risk gauge, SHAP chart, evidence cards, rationale
│   │   │   └── charts/               # Recharts wrappers
│   │   │
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── sse.ts                # SSE client for investigation stream
│   │       └── types.ts
│   │
│   └── public/
│
└── docs/
    ├── architecture.md
    └── presentation/
```

---

## 10. End-to-End Data Flow

### 10.1 Batch Pipeline (Offline — Data → Scores)

```
1. Synthea generates raw Medicare Part B professional claims
   │
2. inject_anomalies.py adds 3 anomaly types with ground truth labels
   │  (train/test use different anomaly parameter distributions)
   │
3. generate_receipt_dates.py adds synthetic claim_receipt_date
   │
4. Point-in-time feature engineering (strict lookback windows on claim_receipt_date)
   │
5. Rules baseline flags deterministic violations
   │
6. XGBoost scores every claim (risk 0-100) + SHAP values computed
   │
7. Scores + SHAP values + rules flags persisted to Parquet
   │
8. FastAPI loads Parquet into memory at startup
   │
9. High-risk claims (xgboost_score > threshold OR rules flag) marked "needs_investigation"
```

### 10.2 On-Demand Investigation (User-Triggered)

```
1. Investigator clicks "Investigate" on a flagged claim
   │
2. FastAPI triggers LangGraph orchestrator, opens SSE stream to client
   │
3. Triage node (deterministic): classifies anomaly type, selects evidence tools
   │  → SSE event: triage result sent immediately
   │
4. Evidence node (deterministic): executes selected tools
   │  (NCCI lookup, RAG search, provider history, duplicate search)
   │  → SSE event: evidence results sent
   │
   ├── If evidence empty → SSE event: halt, "Manual Review Required"
   │
5. Rationale node (LLM): synthesizes investigation rationale with citations
   │  → SSE events: streamed text chunks
   │
6. SSE event: complete — full investigation result stored
   │
7. Investigator reviews, provides feedback (accept/reject/escalate)
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

**Priority order — write these first, in this sequence:**

1. **Point-in-time leakage test** — write this BEFORE writing feature engineering code (see §4.1 for the exact test). This is the highest-leverage test in the project. If this test doesn't exist, the evaluation metrics cannot be trusted.
2. **Triage routing test** — verify correct evidence tool selection for each of the 3 anomaly types, and for the low-risk bypass case.
3. **Halt condition test** — verify that an empty evidence payload triggers halt and does NOT invoke the rationale node.
4. **NCCI engine test** — verify conflict lookup against known code pairs, including edge cases (expired edit, no edit found).
5. **Anomaly injection test** — verify each of 3 patterns is injected with correct parameter distributions (train vs. test).
6. **Rules baseline test** — verify each deterministic flag fires correctly.
7. **RAG chunking test** — verify document parsing and chunk boundaries.

### 11.2 Integration Tests

- ML pipeline end-to-end: raw data → features → model → scores
- Evidence pipeline: NCCI lookup + RAG retrieval for sample claims
- Orchestrator pipeline: claim → triage → evidence → rationale (mock LLM for speed)
- Halt condition: verify empty evidence triggers halt, not hallucinated rationale
- API endpoints: request → response validation
- SSE streaming: verify event sequence and structure

### 11.3 Evaluation Tests

- ML model performance: AUC-ROC, precision-recall, per-anomaly-type recall
- **Ablation: XGBoost lift over rules baseline on holdout anomaly distributions**
- RAG retrieval quality: precision@5 on golden question set (~50 queries)
- Rationale quality: manual evaluation rubric on 50 sample claims
- End-to-end latency: click investigate → full rationale timing

---

## 12. Demo Narrative & Presentation Strategy

### 12.1 The Story Arc

1. **Open Dashboard** — "Here's the investigator's morning view. 847 Medicare Part B claims processed overnight. 52 flagged for investigation — some by rules, some by ML, some by both."

2. **Explore Flagged Claims** — "Sort by risk score. This claim stands out — XGBoost risk 94, suspected upcoding."

3. **Trigger Investigation** — "One click. Triage classifies it instantly as upcoding and selects billing policy search + provider history. Evidence cards appear in under 2 seconds. Then the rationale streams in — synthesized from the actual evidence, with inline citations. Done in under 15 seconds."

4. **Review AI Rationale** — "The system cites CMS Claims Processing Manual Chapter 12 and found this provider bills this procedure at 3.1x the specialty average. Every statement has a source link."

5. **Show Architectural Transparency** — "Every step is visible. Triage is deterministic — it routes based on model outputs, not another LLM call. Evidence gathering is deterministic — structured NCCI lookup and RAG retrieval. Only the rationale synthesis uses an LLM, because that's what language models are good at."

6. **Show ML Rigor** — "XGBoost achieves AUC 0.89 on synthetic data — but here's what makes this credible: the model was trained on one anomaly distribution and tested on a different one. The ablation shows rules catch the obvious violations, but XGBoost adds measurable lift by detecting subtle patterns. That's generalization, not memorization."

7. **Honest Framing** — "This runs on synthetic data. The schema follows medallion architecture patterns. The evidence systems are extensible — AMA CPT docs, LCD databases, payer policies plug into the same interface. What you're seeing is the architecture and capability, ready for real data."

### 12.2 Key Talking Points

- **$100B problem** — improper payments are massive; AI-assisted investigation is a force multiplier
- **Not replacing investigators — amplifying them** — AI does evidence gathering; humans decide
- **Right tool for each job** — deterministic rules for structured data, ML for pattern detection, LLM for synthesis
- **Explainable and grounded** — SHAP explains the ML; citations ground the rationale; NCCI is deterministic
- **Production architecture patterns** — medallion schema, typed state orchestration, extensible evidence systems
- **Honest about limitations** — synthetic data, narrow corpus, capability demo — which makes it MORE credible

---

## 13. Implementation Phases (4 Weeks)

### Week 1: Data & ML Foundation

- Set up project structure, Docker, environment
- Generate synthetic Medicare Part B data with Synthea + 3 anomaly types (with distribution partitioning)
- Generate synthetic claim_receipt_date with lognormal lag
- Build point-in-time feature engineering pipeline
- Implement rules baseline
- Train XGBoost, compute SHAP values, run ablation
- Basic FastAPI skeleton with Parquet loading and claims endpoints

### Week 2: Evidence Systems, Orchestrator & SSE

- Build simplified NCCI conflict lookup
- Build RAG pipeline (CMS manual ingestion, chunking, embedding, ChromaDB)
- Build LangGraph orchestrator (deterministic triage + evidence nodes, LLM rationale node)
- **Wire up investigation SSE endpoint this week — not Week 3.** SSE sits at the backend/frontend integration seam. If it has issues (CORS, buffering, connection handling), you need time to diagnose or switch to the polling fallback (see §7.2). Leaving SSE to Week 3 makes it a demo-blocker.
- **Rationale prompt iteration this week — not Week 4.** The single LLM synthesis call needs 2-3 days of prompt work to reliably produce: structured JSON output, citations from only retrieved sources (no hallucination), and investigation-useful text that scores >85% in manual eval. This is not Week 4 polish — it is Week 2 core work. If you leave prompt engineering to the final week, you will not have time to iterate.
- Begin frontend scaffolding (Next.js + dashboard layout)

### Week 3: Frontend & Integration

- Complete dashboard with KPI cards, risk distribution, ablation summary
- Build claims explorer with filters and sorting
- Build claim detail + investigation view with SHAP waterfall
- Wire up SSE for progressive investigation rendering
- Implement accept/reject/escalate workflow
- End-to-end integration testing

### Week 4: Polish & Presentation

- UI polish, loading states, error handling
- Curate demo claims (hand-pick compelling examples for each anomaly type)
- Write documentation
- Prepare presentation deck and demo script
- Rehearse live demo
- Fix edge cases and demo reliability

**Schedule risk:** Week 1 (data generation + ML) and Week 2 (RAG + prompt iteration on rationale) are the highest-risk phases. If behind schedule at end of Week 3, cut: analytics detail, provider context enrichment, staged reveal polish. The core flow (dashboard → claims → investigate → rationale → feedback) is non-negotiable.

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Point-in-time feature leakage (silent)** | **High** | **Write the leakage unit test (§4.1) before writing feature code. If the test doesn't exist, you cannot know whether your AUC is honest.** |
| **SSE integration reliability** | **High** | **Build SSE in Week 2. Have the polling fallback (§7.2) designed in advance. Do not leave SSE to Week 3 — it is a demo-blocker if it fails late.** |
| **Rationale prompt engineering left too late** | **High** | **Start prompt iteration in Week 2. One LLM call must reliably produce structured JSON, cite only retrieved sources, and score >85% in manual eval. This takes 2-3 days of iteration — it is not Week 4 polish.** |
| Rationale hallucinates policy sources | High | Pre-gather all evidence before the LLM call. Prompt must explicitly instruct the model to cite only sources present in the evidence package. Validate on 50 samples during Week 2. |
| RAG retrieves generic policy text | High | Narrow corpus to Part B-relevant chapters; validate with golden set of ~50 queries |
| Synthea data doesn't look realistic enough | Medium | Calibrate with CMS public statistics; curate demo subset |
| ML doesn't beat rules baseline | Medium | This is an honest finding — report it transparently in ablation |
| LLM API costs during development | Medium | Use GPT-4o-mini for iteration, GPT-4o/Claude for demo only |
| 4 weeks is tight | Medium | Non-negotiable core: ML + orchestrator + investigation UI. Cut polish if behind |
| NCCI data format changes | Low | Pin to specific quarterly release; document version |

---

## 15. Future Extensibility (Presentation Talking Points Only)

These are discussion points — things the system could do with more time or at Abacus:

- **Isolation Forest / secondary model:** Add unsupervised outlier detection as a complementary signal (scoped for v2)
- **Embedded chat:** Let investigators ask follow-up questions about a claim using the same evidence tools (v2)
- **Full NCCI modifier logic:** Interpret modifier_indicator field for modifier-bypass decisions (v2)
- **Expand policy corpus:** AMA CPT guidelines, LCD/NCD databases, payer-specific medical policies
- **Expand claims universe:** Medicare Part A, Medicaid, commercial
- **Pre-pay integration:** Move detection upstream into claims adjudication
- **Feedback loop:** Investigator decisions retrain XGBoost continuously
- **Provider profiling:** Long-term provider risk scoring
- **Databricks native:** ML pipeline as Databricks jobs, Unity Catalog for governance, Vector Search for RAG

---

## Appendix: Revision History

### V1 Scope Revision (from original design)

| Area | Original | V1 | Reason |
|---|---|---|---|
| **Name** | Payment Integrity Claims Intelligence Platform | Claims Investigation Intelligence Assistant | Honest framing |
| **Domain** | All payment integrity claims | Medicare Part B professional only | Narrow to what public corpus supports |
| **Anomaly types** | 6 types | 3 types (upcoding, NCCI violations, duplicates) | Only types with verifiable policy backing |
| **ML models** | 3-model ensemble → XGBoost + IF dual-signal | XGBoost only | One model done right > two done halfway |
| **NCCI** | Full modifier-bypass logic | Simplified conflict-exists check | Full modifier logic is v2 |
| **Agents** | 3 LLM agents (triage, evidence, rationale) | Deterministic triage + evidence, one LLM rationale | LLMs only where they add value |
| **Chat** | Embedded conversational chat in claim detail | Cut (v2) | Scope trap; rationale output is sufficient |
| **Storage** | SQLite + ORM | Parquet loaded in-memory | Simpler, more honest for prototype, Abacus-native format |
| **Analytics** | Full analytics page | Small ablation summary in dashboard | Don't build a product; prove the ML works |
| **Frontend pages** | 4-6 pages | 3 pages (dashboard, claims, claim detail) | Each page polished and stable |
| **Evaluation** | Random split → grouped temporal | Grouped temporal + injection distribution partitioning | Prevent leakage AND memorization |
| **Framing** | "audit-ready", "production-ready" | "investigation-support", "capability demonstration" | Honest about what synthetic data can prove |

### Architectural Critique Fixes (Retained from Round 2)

| Area | Issue | Fix |
|---|---|---|
| **Injection distribution** | XGBoost memorizes injection function | Train/test use different anomaly parameter distributions (§2.2) |
| **Temporal anchor** | `service_date` ignores claims lag; creates leakage | Synthetic `claim_receipt_date`; all features anchored to it (§2.1, §4.1) |
| **Empty evidence** | Sequential chain forces hallucination on empty context | Conditional edge: empty evidence → halt (§6.1, §6.3) |

# Claims Investigation Intelligence Assistant — Design Specification

> **Revised after adversarial review with GPT-5.4 and subsequent architectural critique.** Changes from the original spec are documented in the Appendix.

## 1. Problem Statement

Healthcare payers lose over $100B annually to improper payments (GAO, 2023). Payment integrity teams currently rely on fragmented, siloed workflows — manually cross-referencing claims against policy rules and coding guidelines — to identify and investigate suspicious claims. This process is slow, inconsistent, and scales poorly.

This project builds an **AI-powered Claims Investigation Intelligence Assistant** that combines classical ML-based anomaly detection with agentic GenAI to automatically flag suspicious Medicare Part B professional claims, retrieve relevant policy evidence, and generate investigation-support rationales — demonstrating how AI can reduce manual investigation effort while improving consistency.

### 1.1 Why Payment Integrity?

- **Abacus Insights' #1 product vertical** by AI automation potential (30-55% estimated efficiency gain)
- Strategic priority evidenced by the recent Abacus-CoverSelf partnership
- Documents identify "manual reconciliation", "siloed workflows", and "fragmented data" as explicit pain points
- The vertical has the strongest combination of data volume, repeatability, and direct workflow leverage

### 1.2 Domain Scope: Medicare Part B Professional Claims

The system is intentionally narrowed to **Medicare Part B professional claims** — the cleanest fit with publicly available CMS assets (NCCI practitioner edits, CMS Claims Processing Manual, HCPCS descriptions). This is not a general payment integrity platform. It is a focused investigation assistant for a specific, well-defined claims universe where the public policy corpus can actually support decision-relevant evidence retrieval.

### 1.3 Scope Boundaries

**In scope:**
- Claims anomaly detection ML pipeline (ingestion -> feature engineering -> scoring) for Medicare Part B professional claims
- RAG system over public CMS policy documents for explanatory evidence
- NCCI rules engine with modifier-aware structured lookups (not RAG)
- Multi-agent investigation workflow (triage -> evidence retrieval -> rationale generation) via LangGraph
- Interactive dashboard with claim explorer, risk scoring, evidence trails, and embedded investigation chat
- Evaluation metrics with honest synthetic-data framing and rules baseline ablation
- Designed with Abacus-compatible patterns (medallion schema, configurable connectors)

**Out of scope:**
- Real PHI/PII data handling or HIPAA-compliant deployment
- Integration with actual claims adjudication systems
- Pre-pay real-time decisioning (this focuses on post-pay investigation)
- Provider communication and dispute management
- Production-grade authentication/authorization
- Full CPT coding guidelines (AMA-copyrighted)
- NCDs, LCDs, or payer-specific coverage policies

### 1.4 Success Metrics

| Metric | Target | Notes |
|---|---|---|
| XGBoost AUC-ROC on synthetic data | > 0.85 | Grouped temporal split; framed as capability demo |
| XGBoost lift over rules baseline | Measurable | Ablation proves ML adds value beyond deterministic checks |
| RAG retrieval precision on policy evidence | > 80% | On golden eval set of Medicare Part B policy questions |
| Agentic rationale coherence (manual eval on 50 samples) | > 85% rated "useful" | Human evaluation rubric |
| Time-to-first-result (triage output streamed) | < 5 seconds | User sees triage immediately while evidence/rationale continue |
| End-to-end latency: claim -> full rationale | < 30 seconds | All 3 agent steps complete |
| UI completeness | Fully interactive with core investigation flow | Dashboard -> claims -> investigate -> feedback |
| Demo readiness | Live walkthrough-ready with compelling narrative | Honest about synthetic data and limitations |

### 1.5 Honest Framing & Limitations

This project is a **capability demonstration**, not a production fraud detector. Key limitations acknowledged upfront:

- **Synthetic data**: All ML metrics are on Synthea-generated data with programmatically injected anomalies. Model performance on real payer claims would differ and require re-training with real data.
- **Narrow policy corpus**: Only publicly available CMS material is indexed. Production use would require AMA CPT guidelines, LCD/NCD databases, and payer-specific policies.
- **Injected anomalies**: The ML model detects patterns we injected, which are based on real fraud typologies but are not a substitute for real-world improper payment distributions. CMS notes most improper payments stem from documentation and medical-necessity issues, not just coding anomalies.
- **Investigation-support, not audit-ready**: AI rationales support human investigation. They are not legally defensible audit determinations.

What IS demonstrated: production-architecture patterns, end-to-end ML + GenAI + agentic pipeline, explainable AI, human-in-the-loop design, and domain-grounded evidence retrieval.

---

## 2. Data Strategy

### 2.1 Synthetic Claims Data

**Primary source: Synthea**
Generate ~50K-100K synthetic patient records producing realistic Medicare Part B professional claims histories including:
- Professional claims (office visits, procedures, specialist consultations)
- Member eligibility and enrollment
- Provider roster with specialties and NPI numbers

**Synthetic claim_receipt_date generation:**
Real healthcare claims have significant lag between service and submission. Synthea does not model this. We generate a synthetic `claim_receipt_date` per claim by adding a realistic lag to `service_date`:
- Distribution: lognormal with median ~14 days, 90th percentile ~45 days (calibrated to CMS claims lag statistics)
- This is the temporal anchor for all point-in-time feature aggregations — NOT `service_date`
- Rationale: in production pipelines, features available at decision time depend on when claims arrive, not when services occurred. Using `service_date` would create temporal leakage by treating future-submitted claims as known.

**Supplementary: CMS Public Use Files**
Medicare provider utilization and payment data from CMS.gov to calibrate realistic charge distributions, procedure frequencies, and provider billing patterns for Part B professional services.

### 2.2 Injected Anomaly Patterns

Narrowed to **3 anomaly types** that the public policy corpus (CMS manuals + NCCI practitioner edits) can actually support with decision-relevant evidence:

| Pattern | Description | Injection Method | Rate | Policy Basis |
|---|---|---|---|---|
| **Upcoding** | Procedure codes shifted to higher-paying variants within same family | Replace CPT codes with higher-level codes in same category | ~2% | CMS Claims Processing Manual billing rules |
| **NCCI Code-Pair Violations** | Procedures billed together that violate NCCI edit rules (unbundling, mutually exclusive) | Pair conflicting procedure codes per NCCI practitioner PTP edits, without valid modifier bypass | ~2% | NCCI PTP edits (structured rules) |
| **Duplicate Billing** | Same service billed multiple times with slight date/modifier variations | Clone claims with +-1 day offset and minor modifier changes | ~1.5% |CMS Claims Processing Manual duplicate billing rules |

Total anomaly rate: ~5.5%. Each injected anomaly gets a label record: `(claim_id, anomaly_type, injection_params)`.

**Injection Distribution Partitioning (Train vs. Test):**

To prevent XGBoost from simply memorizing the injection function, anomaly injection uses **different parameter distributions** for train and test data:

| Anomaly Type | Train Distribution | Test Distribution (Holdout) |
|---|---|---|
| Upcoding | Shift by exactly 1 CPT level within category | Shift by 2 levels, or cross-category shifts |
| NCCI Violations | Top 50 most common conflicting code pairs | Next 50 code pairs (different but structurally similar) |
| Duplicate Billing | Clone with +-1 day offset | Clone with +-2-3 day offset and different modifier patterns |

This means the ablation metric (XGBoost lift over rules baseline) measures **generalization to unseen anomaly variants**, not memorization of injection logic. If XGBoost can detect upcoding-by-2-levels after training on upcoding-by-1-level, it learned the structural pattern. If it can't, that's an honest finding.

**Why only 3 types:** GPT-5.4's adversarial review correctly identified that anomaly types must be supportable by the policy corpus. These 3 have direct, verifiable policy backing in public CMS material. "Phantom services" and "provider outliers" from the original spec lacked sufficient policy grounding for evidence-based investigation rationales.

### 2.3 Policy & Rules Knowledge Base

**Two distinct systems — not one:**

**A. NCCI Rules Engine (Structured Lookup, NOT RAG):**

| Asset | Content | Format | Update Cadence |
|---|---|---|---|
| NCCI Practitioner PTP Edits | Code-pair conflicts, mutually exclusive procedures | CSV with code_1, code_2, effective_date, deletion_date, modifier_indicator | Quarterly (CMS.gov) |
| Modifier Indicators | Whether modifier bypass (e.g., -59, -XE/XS/XP/XU) is allowed for each code pair | Encoded in PTP edit modifier_indicator column (0, 1, 9) | Quarterly |

This is treated as a **deterministic rules engine** with structured queries, not semantic search. Modifier logic is explicitly modeled: modifier_indicator=1 means a modifier can bypass the edit; modifier_indicator=0 means it cannot.

**B. RAG Corpus (Explanatory Policy Text):**

| Source | Content | Availability | Scope |
|---|---|---|---|
| CMS Medicare Claims Processing Manual | Selected chapters relevant to Part B professional billing (Ch. 12: Physician/Practitioner, Ch. 23: Fee Schedule, Ch. 26: Completing Claims) | Public (cms.gov) | Narrowed to Part B professional |
| HCPCS Code Descriptions | Procedure code descriptions and categories | Public (cms.gov) | Full HCPCS Level II |
| CMS Fraud, Waste & Abuse Guidelines | Definitions, examples, investigation procedures | Public (cms.gov) | General |

RAG is used **only for explanatory text** — helping the rationale agent cite specific policy language. It does NOT adjudicate code-pair validity (that's the NCCI rules engine).

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
│   │                             # claim_receipt_date (synthetic lag from service_date),
│   │                             # procedure_codes, diagnosis_codes, modifiers,
│   │                             # charge_amount, allowed_amount, paid_amount,
│   │                             # place_of_service
│   ├── member_eligibility.parquet # member_id, plan_id, enrollment_dates, demographics
│   ├── provider_roster.parquet   # provider_id, NPI, specialty, facility_type, network_status
│   └── anomaly_labels.parquet    # claim_id, anomaly_type, anomaly_subtype, injection_params
│
├── features/                     # ML-ready feature tables (SAM equivalent)
│   ├── claim_features.parquet    # Per-claim feature vectors (point-in-time)
│   ├── provider_features.parquet # Aggregated provider-level statistics (point-in-time)
│   └── member_features.parquet   # Aggregated member-level patterns (point-in-time)
│
├── ncci/                         # Structured rules (NOT in RAG)
│   ├── practitioner_ptp_edits.csv # Code-pair rules with modifier indicators
│   └── ncci_metadata.json        # Version, effective date, source URL
│
└── policy_docs/                  # RAG corpus
    ├── cms_claims_manual/        # Selected chapters, chunked markdown
    ├── hcpcs_descriptions/       # Code descriptions
    └── fraud_guidelines/         # CMS FWA reference material
```

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                         │
│  ┌───────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Dashboard  │  │   Claims     │  │  Claim Detail +        │   │
│  │ Overview   │  │   Explorer   │  │  Investigation +       │   │
│  │           │  │             │  │  Embedded Chat +       │   │
│  │           │  │             │  │  Analytics             │   │
│  └─────┬─────┘  └──────┬──────┘  └───────────┬────────────┘   │
└────────┼───────────────┼──────────────────────┼────────────────┘
         │               │                      │
         ▼               ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API LAYER (FastAPI)                           │
│  /claims  /claims/{id}/investigate  /chat  /analytics           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  ML PIPELINE   │ │AGENTIC LAYER │ │ EVIDENCE SYSTEMS │
│                │ │              │ │                  │
│ Feature Engine │ │ Triage Agent │ │ NCCI Rules Engine│
│ XGBoost Scorer │ │ Evidence     │ │ (structured)     │
│ IF Novelty     │ │   Agent      │ │                  │
│ SHAP Explainer │ │ Rationale    │ │ RAG Retriever    │
│ Rules Baseline │ │   Agent      │ │ (CMS policy text)│
│                │ │ Orchestrator │ │                  │
└───────┬────────┘ └──────┬───────┘ └────────┬─────────┘
        │                 │                   │
        ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                   │
│  Claims (Parquet/SQLite)  │  NCCI (CSV)  │  Policy (ChromaDB)  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 + Tailwind CSS + shadcn/ui | Modern, fast, great component library |
| **API** | FastAPI (Python) | Async, fast, auto-docs, ML-ecosystem native |
| **ML Pipeline** | scikit-learn, XGBoost, SHAP | Industry-standard, explainable, fast iteration |
| **NCCI Rules Engine** | Pandas/custom Python | Structured lookups with modifier logic |
| **RAG System** | ChromaDB + LangChain | Lightweight vector store, no infra overhead |
| **Embeddings** | OpenAI `text-embedding-3-small` | Cost-effective, high quality |
| **LLM** | OpenAI GPT-4o or Anthropic Claude Sonnet | Best balance of quality/speed/cost for agents |
| **Agentic Framework** | LangGraph | Stateful sequential orchestration with state passing |
| **Data Processing** | Pandas + Polars | Fast local processing; Spark-compatible patterns |
| **Storage** | Parquet files + SQLite + ChromaDB | Zero-infra, portable |
| **Data Generation** | Synthea + custom Python injectors | Synthetic healthcare data |

### 3.3 Abacus-Compatible Patterns

These are **architecture patterns**, not production-ready integrations:

- **Parquet + medallion schema** mirrors Abacus's Databricks lakehouse layout
- **FastAPI** is a standard Python backend — trivially containerized for cloud deployment
- **ChromaDB** follows the same API pattern as Databricks Vector Search
- **LangGraph agents** are model-agnostic — swap OpenAI for Azure OpenAI
- **Feature engineering in Pandas/Polars** uses patterns directly portable to PySpark

---

## 4. ML Pipeline — Anomaly Detection & Risk Scoring

### 4.1 Feature Engineering

All features are computed **point-in-time** using strict lookback windows anchored to `claim_receipt_date` (not `service_date`). For each claim, aggregate features only use claims whose `claim_receipt_date` is strictly before the current claim's `claim_receipt_date`. This mirrors production reality: at decision time, you only know about claims that have already arrived in the system, regardless of when the service occurred.

**Claim-Level Features (per claim):**
- `charge_amount`, `allowed_amount`, `paid_amount`, `charge_to_allowed_ratio`
- `num_procedure_codes`, `num_diagnosis_codes`, `num_modifiers`
- `days_between_service_and_submission`
- `place_of_service_encoded`
- `procedure_complexity_score` (derived from CPT/HCPCS hierarchy)
- `has_ncci_conflict` (binary: does this claim contain a code pair flagged by NCCI without valid modifier?)
- `modifier_count`, `modifier_59_present` (modifier usage patterns)

**Provider-Level Features (point-in-time aggregated by claim_receipt_date, joined to claims):**
- `provider_avg_charge_30d`, `provider_claim_volume_30d`, `provider_specialty_charge_percentile`
- `provider_unique_patients_30d`
- `provider_procedure_concentration` (HHI of procedure code distribution)
- `provider_peer_deviation` (z-score vs. same-specialty peers in lookback window)
- All 30d/90d windows are based on `claim_receipt_date`, not `service_date`

**Member-Level Features (point-in-time aggregated by claim_receipt_date, joined to claims):**
- `member_claim_frequency_90d`, `member_unique_providers_90d`
- `member_avg_charge_90d`, `member_chronic_condition_count`
- All windows based on `claim_receipt_date`

**Removed features** (from original spec):
- ~~`member_historical_anomaly_rate`~~ — label leakage in synthetic data
- ~~`provider_denial_rate_historical`~~ — not available in synthetic data
- ~~`diagnosis_procedure_coherence_score`~~ — medical appropriateness is not semantic similarity; this feature would be noisy and misleading

### 4.2 Model Architecture — Dual-Signal Approach

```
                    ┌─────────────────┐
                    │  Input Features  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    ┌──────────────────┐          ┌──────────────────┐
    │     XGBoost       │          │  Isolation Forest │
    │   (supervised)    │          │  (unsupervised)   │
    │                  │          │                  │
    │  Primary risk    │          │  Population      │
    │  score (0-100)   │          │  novelty score   │
    │  + SHAP values   │          │  (0-100)         │
    └────────┬─────────┘          └────────┬─────────┘
             │                             │
             ▼                             ▼
    ┌──────────────────────────────────────────────┐
    │        DISPLAYED SIDE BY SIDE IN UI           │
    │  XGBoost: "Known-pattern risk" + explanation  │
    │  IF: "Population unusualness" signal           │
    └──────────────────────────────────────────────┘
```

**Why two separate models, not an ensemble:**
- **XGBoost** detects known anomaly patterns from the labeled data. SHAP `TreeExplainer` provides faithful, exact feature attributions for every prediction. This is the primary score shown to investigators.
- **Isolation Forest** detects statistical outliers regardless of labels. Reported as a separate "novelty score" — a complementary signal, not blended into the XGBoost score. If it adds no actionable value during testing, it gets cut from the UI.

**Isolation Forest feature scoping:**
Unsupervised anomaly detection on raw claims features will predominantly flag expensive or rare procedures — legitimate but unusual claims, not improper billing. To make IF actually useful:
- **Exclude** from IF inputs: `charge_amount`, `allowed_amount`, `paid_amount`, `procedure_complexity_score`, and any pure dollar/rarity features
- **Include** in IF inputs: behavioral and relational features only — `charge_to_allowed_ratio`, `provider_peer_deviation`, `provider_procedure_concentration`, `num_modifiers`, `modifier_count`, `days_between_service_and_submission`
- This forces IF to detect outliers in **billing behavior patterns**, not just expensive claims
- **UI suppression rule:** If IF flags a claim but XGBoost does not AND no rules are violated, suppress it from the primary investigation queue. Show it only in a secondary "unusual patterns" view to avoid alert fatigue.

**No autoencoder, no meta-learner.** The original ensemble was criticized for making SHAP explanations unfaithful. This dual-signal approach is cleaner: one score is fully explainable (XGBoost+SHAP), the other is a scoped unsupervised behavioral signal.

### 4.3 Rules Baseline & Ablation

A **deterministic rules baseline** is implemented to prove the ML model adds value beyond simple checks:

```
Rules baseline:
  - Flag claims with NCCI code-pair violations (no valid modifier)
  - Flag claims where charge > 2x specialty average
  - Flag claims with exact-duplicate (same provider, member, procedure, +-1 day)
```

**Ablation comparison (shown in analytics):**

| Method | What it catches |
|---|---|
| Rules baseline | Obvious violations detectable by deterministic checks |
| Isolation Forest | Statistical outliers regardless of rules |
| XGBoost | Pattern combinations rules miss (e.g., subtle upcoding within same category, volume patterns) |

This proves the ML adds incremental value. If XGBoost doesn't beat the rules baseline, that's an honest finding worth reporting.

### 4.4 Explainability (SHAP)

SHAP `TreeExplainer` on XGBoost provides **faithful, exact feature attributions**:
- Top 5 contributing features per claim
- Feature importance rendered as a waterfall chart in the UI
- Natural language summary generated by the LLM from SHAP values (e.g., "This claim was flagged primarily because the charge amount ($8,450) is 3.2 standard deviations above the provider's peer group average for this procedure.")

The SHAP explanation covers **only the XGBoost score**, not the IF novelty score. This is intentionally transparent — we explain what we can explain faithfully.

### 4.5 Model Training & Evaluation

**Grouped temporal split:**
1. Sort all claims by `claim_receipt_date` (the production-realistic temporal anchor)
2. Split temporally: first 70% of receipt dates → train, next 15% → validation, last 15% → test
3. Within each split, ensure no provider_id appears in both train and test (grouped split)
4. This prevents both temporal leakage and provider-level information leakage
5. **Injection distribution partitioning**: train set uses train-distribution anomaly parameters; test set uses holdout-distribution parameters (see §2.2)

**Point-in-time feature construction:** All aggregate features (provider stats, member stats) are computed using only claims whose `claim_receipt_date` is strictly before the target claim's `claim_receipt_date`. No future information leaks into features — this mirrors the real-world constraint where only previously received claims are available at decision time.

**Evaluation metrics:**
- AUC-ROC (primary — target > 0.85 on synthetic data)
- Precision-Recall curve (critical for imbalanced data)
- Precision@K (how many of the top K flagged claims are actual anomalies)
- Per-anomaly-type recall (can we detect each of the 3 patterns?)
- **Ablation vs. rules baseline** (lift metric — what does XGBoost add?)

All metrics are explicitly framed as **performance on synthetic data with injected anomalies**. They demonstrate the pipeline's capability, not production accuracy.

---

## 5. Evidence Systems

### 5.1 NCCI Rules Engine (Structured, Not RAG)

```
Query: (code_1=27447, code_2=27446, date=2026-03-15, modifiers=[59])
  │
  ▼
┌──────────────────────────────────────┐
│  NCCI Practitioner PTP Lookup        │
│  1. Find matching code pair          │
│  2. Check effective_date range       │
│  3. Read modifier_indicator:         │
│     0 = edit cannot be bypassed      │
│     1 = modifier can bypass edit     │
│     9 = not applicable               │
│  4. If indicator=1, check if claim   │
│     has valid modifier (-59, -XE,    │
│     -XS, -XP, -XU)                  │
│  5. Return: allowed/denied + reason  │
└──────────────────────────────────────┘
```

This is a **deterministic rules engine** — no LLM, no embeddings, no approximation. It returns structured results: `{code_pair, edit_type, modifier_indicator, modifier_present, result: "violation"|"allowed"|"no_edit_found", rationale}`.

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
- If basic retrieval proves insufficient during testing, add LLM-based reranking (not pre-committed)

### 5.3 What's NOT in the Evidence System

Explicitly excluded (and acknowledged in the demo):
- AMA CPT Professional Edition guidelines (copyrighted)
- NCDs and LCDs (local coverage decisions — payer-specific)
- Payer-specific medical policies and coverage criteria
- Clinical documentation / medical records

The architecture is **extensible** — these sources plug into the same retrieval interface. The demo acknowledges where they would go.

---

## 6. Agentic Layer — Multi-Agent Investigation

### 6.1 Agent Architecture (LangGraph Sequential Chain)

```
┌──────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR (LangGraph Sequential)              │
│                                                               │
│   ┌─────────┐     ┌──────────┐     ┌────────────┐           │
│   │ TRIAGE  │────▶│ EVIDENCE │────▶│ RATIONALE  │           │
│   │ AGENT   │     │ AGENT    │     │ AGENT      │           │
│   └─────────┘     └──────────┘     └────────────┘           │
│        │               │                │                    │
│        ▼               ▼                ▼                    │
│   Classifies       Gathers          Synthesizes             │
│   anomaly type,    evidence via      investigation          │
│   ROUTES to        type-specific     rationale with         │
│   different        tools             citations              │
│   evidence paths                                             │
│                                                               │
│   ┌─────────────────────────────────────────────────────┐    │
│   │           SHARED STATE (LangGraph State)            │    │
│   │  claim_data, xgboost_score, if_novelty_score,       │    │
│   │  shap_values, anomaly_type, evidence_path,          │    │
│   │  evidence_results, rationale, investigation_status   │    │
│   └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

Sequential chain with **one conditional edge**: if the Evidence Agent returns an empty or insufficient payload, the flow halts with a "Manual Review Required: Insufficient Evidence" state instead of forcing the Rationale Agent to hallucinate over empty context. This is the only branching — everything else flows forward through 3 nodes.

### 6.2 Agent Specifications

**Triage Agent — Classification + Routing**
- **Input:** Claim data + XGBoost risk score + SHAP feature attributions + IF novelty score
- **Task:** Classify the suspected anomaly type, assign investigation priority, and **determine which evidence tools to invoke** (this is its non-redundant value: different anomaly types need different evidence paths)
- **Routing logic:**
  - Suspected NCCI violation → Evidence Agent uses `lookup_ncci_edits()` as primary tool
  - Suspected upcoding → Evidence Agent uses `search_policy_docs()` for billing rules + `get_provider_history()` for peer comparison
  - Suspected duplicate → Evidence Agent uses `get_claim_duplicates()` + `search_policy_docs()` for duplicate billing rules
- **Output:** `{anomaly_type, confidence, priority, evidence_tools_to_use[]}`
- **Strict JSON output schema enforced**

**Evidence Agent — Tool-Using Retrieval**
- **Input:** Triage output + claim details
- **Task:** Execute the evidence tools specified by triage. Compile results into structured evidence package.
- **Tools available:**
  - `lookup_ncci_edits(code_1, code_2, modifiers, date)` → NCCI rules engine
  - `search_policy_docs(query, filters)` → RAG retrieval
  - `get_provider_history(provider_id, lookback_days)` → provider billing patterns from DB
  - `get_claim_duplicates(member_id, procedure_code, date_range)` → potential duplicate claims from DB
- **Output:** `{policy_citations[], ncci_findings[], historical_context, evidence_summary}`
- **Strict JSON output schema enforced**

**Rationale Agent — Synthesis + Conversational Follow-Up**
- **Input:** Full investigation state (claim + triage + evidence)
- **Task:** Synthesize all findings into a coherent investigation-support rationale. Cite specific policy sections. Include: summary, supporting evidence, policy basis, recommended next step, confidence level.
- **Also handles embedded chat:** When invoked in conversational mode (via the claim detail chat), it has access to the same tools as the evidence agent for follow-up questions.
- **Output:** `{rationale_text, citations[], recommended_action, confidence, review_needed}`
- **Guardrails:** Must cite all relevant policy sources found (not a minimum count — avoids citation padding). Must not recommend a final determination. Confidence must reflect evidence strength.
- **Strict JSON output schema enforced**

### 6.3 Orchestration Flow

```
1. Claim flagged by ML pipeline (xgboost_score > threshold)
         │
         ▼
2. Triage Agent classifies anomaly type + selects evidence tools
         │
         ├── If triage confidence < 0.5 → mark as "needs manual triage"
         │
         ▼
3. Evidence Agent gathers evidence using triage-specified tools
         │
         ├── If evidence payload is empty or insufficient:
         │   → Halt with "Manual Review Required: Insufficient Evidence"
         │   → Do NOT invoke Rationale Agent on empty context
         │
         ▼
4. Rationale Agent generates investigation-support narrative (only with evidence)
         │
         ▼
5. Result stored with full evidence chain + all agent outputs visible in UI
         │
         ▼
6. Investigator reviews, provides feedback (accept/reject/modify)
         │
         ▼
7. Feedback persisted for future improvement
```

### 6.4 Human-in-the-Loop Design

The system is an **investigation assistant**, not an autonomous decision-maker:
- All flagged claims require human review before any action
- Investigators can accept, reject, or modify the AI's rationale
- Rejection feedback is stored for prompt/model improvement
- The UI clearly marks AI-generated content vs. human-confirmed decisions
- Confidence scores are transparent — low-confidence findings are visually distinguished
- Every agent step is observable in the UI (triage output, evidence gathered, rationale generated)

---

## 7. API Design (FastAPI)

### 7.1 Core Endpoints

```
# Claims & Investigation
GET    /api/claims                          # List claims with filters (status, risk, date, provider)
GET    /api/claims/{claim_id}               # Claim details + features + scores
POST   /api/claims/{claim_id}/investigate   # Trigger agentic investigation (SSE stream)
       response: SSE stream of intermediate agent states:
         event: triage    → {anomaly_type, confidence, priority, evidence_tools}
         event: evidence  → {policy_citations[], ncci_findings[], context}
         event: rationale → {rationale_text, citations[], recommended_action}
         event: complete  → full investigation result
         event: halt      → {reason: "insufficient_evidence", manual_review: true}
GET    /api/claims/{claim_id}/investigation # Get stored investigation results
PATCH  /api/claims/{claim_id}/investigation # Investigator feedback (accept/reject/modify)

# Embedded Chat (claim-scoped)
POST   /api/chat                            # Send message in claim investigation context
       body: { claim_id, message, conversation_id }
       response: SSE stream of rationale agent response

# Analytics (precomputed)
GET    /api/analytics/overview              # Dashboard summary stats
GET    /api/analytics/model-performance     # ML metrics + rules baseline ablation
GET    /api/analytics/anomaly-distribution  # Breakdown by anomaly type

# NCCI Lookup
GET    /api/ncci/{code_1}/{code_2}          # Direct NCCI edit lookup with modifier support
       query params: modifiers, service_date
```

### 7.2 Response Patterns

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
    "if_novelty_score": 72,
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
/claims/[id]         → Claim Detail + Investigation + Embedded Chat
/analytics           → Model Performance, Ablation, Efficiency Metrics
```

**Cut from original spec:** Standalone `/chat` page and `/knowledge` page. Chat is now embedded in claim detail. Knowledge base exploration is not a separate page.

### 8.2 Dashboard Overview

At-a-glance situational awareness:

- **KPI Cards:** Total claims processed, flagged count, investigation rate, avg risk score
- **Risk Distribution Chart:** Histogram of XGBoost risk scores
- **Anomaly Type Breakdown:** Donut chart — upcoding vs. NCCI violations vs. duplicates
- **Top Flagged Claims Table:** Sortable with claim ID, risk score, anomaly type, status, quick-investigate action
- **Provider Risk View:** Top providers by aggregate risk score
- **Synthetic Data Banner:** Persistent, subtle banner reminding viewers this is demo data

### 8.3 Claim Detail & Investigation View

The core workflow screen. When an investigator clicks into a claim:

**Left panel — Claim Facts:**
- Member demographics, provider info, service details
- Procedure and diagnosis codes with HCPCS descriptions
- Charge breakdown (billed vs. allowed vs. paid)
- Modifiers used

**Center panel — AI Investigation:**
- Dual score display: XGBoost risk score (0-100) with SHAP waterfall + IF novelty score (separate gauge)
- **Progressive rendering of agent steps** (SSE-driven, not wait-for-completion):
  1. Triage result appears first (~3-5s) — anomaly type, confidence, evidence tools selected
  2. Evidence cards populate as retrieved (~5-15s) — policy citations, NCCI findings, provider context
  3. Rationale synthesized last (~15-25s) — full narrative with inline citations
  4. If evidence is insufficient → "Manual Review Required" state (no hallucinated rationale)
- This occupies the investigator's attention during the heaviest LLM work and makes the agentic pipeline visible and impressive in demos

**Right panel — Actions & Chat:**
- Accept / Reject / Modify buttons
- Free-text feedback field
- Investigation history timeline
- **Embedded chat** — ask follow-up questions about this claim; rationale agent responds with tool access and citations

### 8.4 Analytics Page

Precomputed metrics displayed with Recharts:
- Model performance: AUC-ROC curve, precision-recall curve (with "synthetic data" label)
- **Ablation chart:** Rules baseline vs. IF vs. XGBoost — showing incremental lift
- Per-anomaly-type detection rates
- Investigation time metrics (simulated comparison: manual vs. AI-assisted)

### 8.5 UI Design Principles

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
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── claims.py
│   │   │   │   ├── chat.py          # SSE streaming (claim-scoped)
│   │   │   │   ├── analytics.py
│   │   │   │   └── ncci.py          # Structured NCCI lookup endpoint
│   │   │   └── dependencies.py
│   │   │
│   │   ├── ml/
│   │   │   ├── features.py          # Point-in-time feature engineering
│   │   │   ├── models.py            # XGBoost + Isolation Forest training
│   │   │   ├── rules_baseline.py    # Deterministic rules for ablation
│   │   │   ├── explainer.py         # SHAP TreeExplainer on XGBoost
│   │   │   └── pipeline.py          # End-to-end training + scoring
│   │   │
│   │   ├── evidence/
│   │   │   ├── ncci_engine.py       # Structured NCCI lookup with modifier logic
│   │   │   ├── rag_ingest.py        # Document parsing + chunking
│   │   │   ├── rag_embeddings.py    # Embedding generation + ChromaDB
│   │   │   └── rag_retriever.py     # Semantic retrieval for policy text
│   │   │
│   │   ├── agents/
│   │   │   ├── orchestrator.py      # LangGraph sequential chain
│   │   │   ├── triage.py            # Classification + evidence routing
│   │   │   ├── evidence.py          # Tool-using evidence retrieval
│   │   │   ├── rationale.py         # Synthesis + conversational follow-up
│   │   │   ├── prompts/
│   │   │   │   ├── triage.md
│   │   │   │   ├── evidence.md
│   │   │   │   └── rationale.md
│   │   │   └── tools.py             # Agent tool definitions
│   │   │
│   │   ├── db/
│   │   │   ├── database.py
│   │   │   ├── models.py
│   │   │   └── seed.py
│   │   │
│   │   └── utils/
│   │       └── schemas.py
│   │
│   ├── data_generation/
│   │   ├── generate_synthea.py
│   │   ├── inject_anomalies.py      # 3 anomaly types only
│   │   ├── calibrate.py
│   │   └── validate.py
│   │
│   ├── scripts/
│   │   ├── setup_evidence.py        # RAG ingestion + NCCI data load
│   │   ├── train_models.py
│   │   └── seed_database.py
│   │
│   └── tests/
│       ├── test_features.py
│       ├── test_models.py
│       ├── test_ncci_engine.py
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
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # Dashboard
│   │   │   ├── claims/
│   │   │   │   ├── page.tsx         # Claims explorer
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx     # Claim detail + investigation + chat
│   │   │   └── analytics/
│   │   │       └── page.tsx         # Model metrics & ablation
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui base components
│   │   │   ├── dashboard/
│   │   │   ├── claims/
│   │   │   ├── investigation/       # Risk gauges, SHAP chart, rationale, agent steps
│   │   │   ├── chat/                # Embedded chat components
│   │   │   └── charts/              # Recharts wrappers
│   │   │
│   │   └── lib/
│   │       ├── api.ts
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

### 10.1 Batch Pipeline (Data Ingestion -> ML Scoring)

```
1. Synthea generates raw Medicare Part B professional claims
   │
2. inject_anomalies.py adds 3 anomaly types with ground truth labels
   │
3. Point-in-time feature engineering (strict lookback windows)
   │
4. Rules baseline flags deterministic violations
   │
5. XGBoost scores every claim (risk 0-100) + SHAP values
   │
6. Isolation Forest scores novelty (0-100)
   │
7. Claims + scores + features loaded into SQLite
   │
8. High-risk claims (xgboost_score > threshold) marked "needs_investigation"
```

### 10.2 On-Demand Investigation (User-Triggered)

```
1. Investigator clicks "Investigate" on a flagged claim
   │
2. FastAPI triggers LangGraph sequential chain
   │
3. Triage Agent: classifies anomaly type, selects evidence tools
   │
4. Evidence Agent: executes selected tools (NCCI lookup, RAG search,
   │                provider history, duplicate search)
   │
5. Rationale Agent: synthesizes investigation-support narrative with citations
   │
6. All agent outputs returned via API, each step visible in UI
   │
7. Investigator reviews, provides feedback (accept/reject/modify)
```

### 10.3 Embedded Chat (Claim-Scoped Follow-Up)

```
1. Investigator types question in claim detail chat panel
   │
2. Message sent to /api/chat with claim_id context (SSE stream)
   │
3. Rationale agent receives message + claim context + investigation state
   │
4. Agent uses tools as needed:
   │  - search_policy_docs() for policy questions
   │  - lookup_ncci_edits() for code pair queries
   │  - get_provider_history() for provider patterns
   │
5. Response streamed back with citations
```

---

## 11. Testing Strategy

### 11.1 Unit Tests
- Feature engineering: verify point-in-time correctness (no future leakage)
- Anomaly injection: verify each of 3 patterns is injected correctly
- NCCI engine: verify modifier logic (indicator=0 vs 1 vs 9)
- RAG chunking: verify document parsing and chunk boundaries
- Rules baseline: verify deterministic flag logic

### 11.2 Integration Tests
- ML pipeline end-to-end: raw data -> features -> model -> scores
- Evidence pipeline: NCCI lookup + RAG retrieval for sample claims
- Agent pipeline: claim -> triage -> evidence -> rationale (mock LLM for speed)
- API endpoints: request -> response validation

### 11.3 Evaluation Tests
- ML model performance: AUC-ROC, precision-recall, per-anomaly-type recall
- **Ablation: XGBoost lift over rules baseline**
- RAG retrieval quality: precision@5 on golden question set
- Agent rationale quality: manual evaluation rubric on 50 sample claims
- End-to-end latency: claim -> rationale timing

---

## 12. Demo Narrative & Presentation Strategy

### 12.1 The Story Arc

1. **Open Dashboard** — "Here's the investigator's morning view. 847 Medicare Part B claims processed overnight. 52 flagged for investigation."

2. **Explore Flagged Claims** — "Sort by risk score. This claim stands out — XGBoost risk 94, suspected upcoding."

3. **Trigger Investigation** — "One click. Watch the agentic pipeline stream in real-time: triage appears in 3 seconds — it's upcoding, routing to billing policy search + provider history. Evidence cards populate one by one... now the rationale synthesizes... done in 18 seconds, and the investigator was engaged the whole time."

4. **Review AI Rationale** — "The system cites CMS Claims Processing Manual Chapter 12 and found 7 similar claims from this provider. Every statement has a source link."

5. **Show Agent Transparency** — "Each agent step is visible. Triage chose these evidence tools because the SHAP features indicated charge deviation, not code-pair conflict. Different anomaly types get different investigation paths."

6. **Ask Follow-Up** — "In the embedded chat: 'Are these two codes allowed on the same date?' The system checks NCCI edits directly — structured lookup, not AI guesswork — and responds with the specific edit rule."

7. **Show ML Rigor** — "XGBoost achieves AUC 0.89 on synthetic data — but here's what makes this credible: the model was trained on one anomaly distribution and tested on a different one. It generalized. And the ablation chart shows: rules baseline catches the obvious violations, but XGBoost adds measurable lift by detecting subtle patterns rules miss. That's not memorization — that's learned structure."

8. **Honest Framing** — "This runs on synthetic data. The schema follows Abacus's medallion architecture. The evidence systems are extensible — AMA CPT docs, LCD databases, and payer policies plug into the same interface. What you're seeing is the architecture and capability, ready for real data."

### 12.2 Key Talking Points

- **$100B problem** — improper payments are massive; AI-assisted investigation is a force multiplier
- **Not replacing investigators — amplifying them** — AI does evidence gathering; humans decide
- **Explainable and grounded** — SHAP explains the ML; citations ground the rationale; NCCI is deterministic
- **Agentic orchestration** — different anomaly types get different investigation paths, not one-size-fits-all
- **Production architecture patterns** — medallion schema, containerized backend, extensible evidence systems
- **Honest about limitations** — synthetic data, narrow corpus, capability demo — which makes it MORE credible, not less

---

## 13. Implementation Phases (4 Weeks)

### Week 1: Data & ML Foundation
- Set up project structure, Docker
- Generate synthetic Medicare Part B data with Synthea + 3 anomaly types
- Build point-in-time feature engineering pipeline
- Implement rules baseline
- Train XGBoost + Isolation Forest, run ablation
- Basic FastAPI skeleton with claims endpoints

### Week 2: Evidence Systems & Agents
- Build NCCI rules engine with modifier logic
- Build RAG pipeline (CMS manual ingestion, chunking, embedding, ChromaDB)
- Build LangGraph sequential chain (triage -> evidence -> rationale)
- Wire up investigation API endpoints
- Begin frontend scaffolding (Next.js + dashboard layout)

### Week 3: Frontend & Integration
- Complete dashboard, claims explorer, claim detail views
- Build investigation view with SHAP visualization + dual scores
- Build agent step visualization (triage -> evidence -> rationale visible)
- Implement embedded chat with SSE streaming
- End-to-end integration testing

### Week 4: Polish & Presentation
- UI polish, loading states, error handling
- Analytics page with ablation charts
- Demo data curation (pick most compelling examples)
- Write documentation
- Prepare presentation deck and demo script
- Rehearse live demo

**Schedule risk:** Week 1 (data generation + ML) and Week 2 (agents + prompt iteration) are the highest-risk phases. If behind schedule, cut: embedded chat (Week 3), analytics page detail (Week 4). The core flow (dashboard -> claims -> investigate -> rationale) is non-negotiable.

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM API costs during development | Medium | Use GPT-4o-mini for iteration, GPT-4o/Claude for demo only |
| Synthea data doesn't look realistic enough | Medium | Calibrate with CMS public statistics; curate demo subset |
| Agent responses are inconsistent | High | Strict JSON output schemas, few-shot prompts, temperature=0 |
| RAG retrieves generic policy text | High | Narrow corpus to Part B-relevant chapters; validate with golden set |
| ML doesn't beat rules baseline | Medium | This is an honest finding — report it transparently in ablation |
| 4 weeks is tight for this scope | Medium | Non-negotiable core: ML + agents + investigation UI. Cut chat and analytics detail if behind |
| Triage agent adds no real value | Medium | If it doesn't change evidence tool selection in practice, merge into deterministic routing |
| IF novelty score is noise | Low | If not actionably different from XGBoost score, remove from UI |

---

## 15. Future Extensibility (Presentation Talking Points Only)

These are discussion points — things the system could do if deployed at Abacus:

- **Expand policy corpus:** AMA CPT guidelines, LCD/NCD databases, payer-specific medical policies
- **Expand claims universe:** Medicare Part A, Medicaid, commercial — each with appropriate policy assets
- **Pre-pay integration:** Move detection upstream into claims adjudication
- **Feedback loop:** Investigator decisions retrain XGBoost continuously
- **Provider profiling:** Long-term provider risk scoring across the book of business
- **Databricks native:** ML pipeline as Databricks jobs, Unity Catalog for governance, Vector Search for RAG

---

## Appendix: Changes from Original Spec (Post-Adversarial Review)

| Area | Original | Revised | Reason |
|---|---|---|---|
| **Name** | Payment Integrity Claims Intelligence Platform | Claims Investigation Intelligence Assistant | Honest framing |
| **Domain** | All payment integrity claims | Medicare Part B professional claims only | Narrow to what public corpus supports |
| **Anomaly types** | 6 types | 3 types (upcoding, NCCI violations, duplicates) | Only types with verifiable policy backing |
| **ML architecture** | 3-model ensemble (IF + XGBoost + Autoencoder) with meta-learner | XGBoost (primary, explainable) + IF (separate novelty score) | SHAP faithfulness; no explainability theater |
| **Evaluation** | Random 70/15/15 split | Grouped temporal split + point-in-time features | Fix evaluation leakage |
| **Removed features** | `member_historical_anomaly_rate`, `provider_denial_rate_historical`, `diagnosis_procedure_coherence_score` | Removed | Label leakage, unavailable data, noisy signal |
| **Added** | — | Rules baseline + ablation | Prove ML adds value beyond deterministic checks |
| **NCCI** | RAG-based lookup | Deterministic rules engine with modifier logic | Structured data needs structured lookup |
| **RAG corpus** | CMS manuals + "CPT Coding Guidelines" (AMA) | CMS manuals (Part B chapters) + HCPCS + CMS FWA guidelines | Removed AMA-copyrighted material |
| **RAG role** | Core evidence system | Explanatory text only (NCCI handles code-pair adjudication) | Right tool for right job |
| **Agents** | 3 agents + separate chat agent, complex graph | 3 agents sequential chain, chat folded into rationale agent | Reduced complexity, same capability |
| **Triage agent** | Classifies anomaly type | Classifies + routes to different evidence tools | Must prove non-redundant value |
| **Agent guardrails** | "Must cite at least 2 sources" | "Cite all relevant sources found" | Avoid citation padding |
| **Frontend pages** | 6 pages including /chat and /knowledge | 4 pages, chat embedded in claim detail | Scope reduction |
| **Framing** | "audit-ready", "production-ready" | "investigation-support", "production-architecture patterns" | Honest about capabilities |
| **Timeline** | 3-4 weeks | 4 weeks (3 is aggressive) | Realistic scheduling |
| **Reranking** | Cross-encoder pre-committed | Only if basic retrieval fails during testing | Avoid premature optimization |

### Changes from Architectural Critique (Round 2)

| Area | Issue | Fix |
|---|---|---|
| **Injection distribution** | XGBoost would memorize injection function; ablation lift is circular | Train/test use different anomaly parameter distributions (§2.2) |
| **Temporal anchor** | `service_date` ignores claims lag; creates temporal leakage | Generate synthetic `claim_receipt_date`; all point-in-time features anchored to it (§2.1, §4.1) |
| **Empty evidence handling** | Sequential chain with no failure condition forces hallucination | Conditional edge: empty evidence → halt with "Manual Review Required" (§6.1, §6.3) |
| **Latency / streaming** | 3 sequential LLM calls likely exceed 30s; user stares at spinner | SSE streaming of intermediate agent states; progressive UI rendering (§7.1, §8.3) |
| **IF feature scoping** | IF on raw features just flags expensive/rare procedures | Exclude dollar/rarity features from IF inputs; suppress IF-only flags from primary queue (§4.2) |

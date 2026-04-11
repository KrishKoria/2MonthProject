# Feature Specification: Claims Investigation Intelligence Assistant

**Feature Branch**: `001-claims-investigation-assistant`  
**Created**: 2026-04-11  
**Status**: Draft  
**Input**: AI-powered Claims Investigation Intelligence Assistant for Medicare Part B professional claims — combining risk scoring, policy evidence retrieval, and AI-synthesized investigation rationales with human-in-the-loop review.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Review Flagged Claims Dashboard (Priority: P1)

A payment integrity investigator opens the platform and immediately sees which claims require attention. The dashboard shows a prioritized list of flagged claims sorted by risk level, alongside summary statistics on the current queue (total flagged, high-risk count, anomaly type distribution, and overall volume trends). The investigator can filter by date range, provider, anomaly type, and risk band.

**Why this priority**: This is the entry point to every investigation workflow. Without a prioritized queue, investigators have no way to triage their workload. All other stories depend on this.

**Independent Test**: Can be fully tested by loading the platform and verifying that the dashboard displays flagged claims with risk scores, filters work correctly, and the count of high-risk claims is nonzero on the synthetic dataset. Delivers value as a standalone claims queue viewer even without the investigation workflow.

**Acceptance Scenarios**:

1. **Given** a set of processed synthetic claims with computed risk scores, **When** the investigator opens the dashboard, **Then** flagged claims appear sorted by risk score (highest first) with anomaly type labels, member/provider identifiers, service date, charge amount, and a risk band indicator (high/medium/low).
2. **Given** claims from multiple providers and anomaly types, **When** the investigator applies a filter (e.g., "NCCI violation" type or "high risk" band), **Then** only matching claims are displayed and the count updates accordingly.
3. **Given** the dashboard is loaded, **When** the investigator views the summary section, **Then** they see total flagged claims, breakdown by anomaly type (upcoding, NCCI violation, duplicate billing), and an ablation comparison showing how many claims rules alone would have caught vs. the ML model.

---

### User Story 2 — Investigate a Specific Claim (Priority: P1)

An investigator selects a flagged claim to investigate. The platform triggers a multi-step investigation pipeline and streams progress back in real time: first showing the triage classification (what type of anomaly was detected and why), then the supporting evidence gathered from policy documents and billing records, and finally a synthesized rationale with specific policy citations and a recommended next step. The investigator can read the full rationale, see which policy sections were cited, and understand the AI's confidence level.

**Why this priority**: This is the core value proposition. It replaces the investigator's manual process of cross-referencing claims against policy documents and billing history. Co-equal with P1 dashboard because neither delivers value without the other.

**Independent Test**: Can be tested by selecting any flagged claim and clicking "Investigate." If the rationale is produced with at least one policy citation and a recommended action within 15 seconds, the story is complete. Delivers standalone value as an investigation-support tool even without the feedback capability.

**Acceptance Scenarios**:

1. **Given** a high-risk claim is selected and investigation is triggered, **When** the pipeline runs, **Then** progress events appear in sequence: triage classification → evidence gathered → rationale text streams in — completing within 15 seconds total.
2. **Given** a claim flagged for an NCCI code-pair conflict, **When** the investigation completes, **Then** the rationale identifies the specific conflicting codes, cites the relevant CMS policy section, and recommends a next step (e.g., "Refer for clinical documentation review").
3. **Given** the rationale is displayed, **When** the investigator reviews it, **Then** they can see: the risk score, top contributing factors with their relative influence, all policy citations with source references (document, chapter, section), and the AI confidence level.
4. **Given** a claim where evidence retrieval returns no useful results, **When** the pipeline runs, **Then** the platform clearly marks the claim as "Manual Review Required" rather than generating a rationale from insufficient evidence.
5. **Given** the investigation pipeline encounters an error mid-stream, **When** this occurs, **Then** the platform displays a clear error message and does not leave the investigator with a partially rendered or broken view.

---

### User Story 3 — Provide Investigation Feedback (Priority: P2)

After reviewing the AI-generated rationale, the investigator records their decision: accept the rationale (agree with the finding), reject it (disagree — the claim appears legitimate), or escalate it (flag for senior review or clinical audit). The platform records the outcome and displays it alongside the AI rationale, making it clear which conclusions are human-confirmed vs. AI-generated.

**Why this priority**: Human-in-the-loop feedback closes the investigation loop and establishes accountability. Without it, the platform is a read-only tool. Feedback also creates a record of decisions for future improvement.

**Independent Test**: Can be tested by completing an investigation and submitting an "accept," "reject," or "escalate" decision. If the decision is saved and displayed on the claim detail page with a human-confirmed label, the story is complete.

**Acceptance Scenarios**:

1. **Given** an investigation rationale has been generated, **When** the investigator selects "Accept," "Reject," or "Escalate" and submits, **Then** the decision is recorded and displayed on the claim detail page with a timestamp and the investigator's action.
2. **Given** a claim with a recorded human decision, **When** it appears in the claims list, **Then** its status reflects the outcome (e.g., "Accepted," "Rejected," "Escalated") rather than "Pending Review."
3. **Given** the AI rationale is displayed, **When** no human decision has been recorded, **Then** the UI clearly distinguishes AI-generated content from human-confirmed content using visible labeling.

---

### User Story 4 — Review Model Performance & Ablation (Priority: P3)

A technical stakeholder or evaluator opens the analytics section to assess the ML model's performance. They see the key evaluation metrics (AUC-ROC, precision-recall), an ablation comparison showing what the rules baseline catches vs. what the ML model adds, and a breakdown of detection rates by anomaly type. Metrics are clearly labeled as being on synthetic data.

**Why this priority**: Supports the capability demonstration narrative. Without transparent performance reporting, the platform cannot credibly claim to add value over simpler rule-based approaches.

**Independent Test**: Can be tested by viewing the analytics/model performance section and confirming that AUC-ROC, precision-recall, and the ablation table are displayed with clear synthetic-data labeling.

**Acceptance Scenarios**:

1. **Given** the model has been trained and evaluated, **When** the analytics section is viewed, **Then** the AUC-ROC score, precision-recall curve, and precision@K are displayed with explicit labeling that metrics apply to synthetic data.
2. **Given** the ablation results are available, **When** the evaluator reviews the performance section, **Then** a comparison table shows: what the rules baseline alone detects, what XGBoost alone detects, and what the combined system detects — demonstrating measurable lift.
3. **Given** the anomaly breakdown is displayed, **When** the evaluator inspects it, **Then** per-anomaly-type recall is shown for upcoding, NCCI violations, and duplicate billing separately.

---

### Edge Cases

- What happens when a claim's investigation produces no evidence from any tool? → Platform halts and marks claim "Manual Review Required" without generating a rationale.
- How does the system handle a claim that has already been investigated? → The stored investigation result is retrieved and displayed; the investigator can re-trigger investigation or record a new decision.
- What happens if the investigator tries to submit feedback without reviewing the rationale? → The feedback action is available immediately after investigation completes; no forced read requirement.
- How does the system behave when a claim has multiple anomaly indicators (e.g., both an NCCI conflict and a duplicate billing flag)? → Triage selects the primary anomaly type and gathers evidence for that type; other flags are surfaced in the claim detail view.
- What happens when filtering returns zero claims? → An empty state message is displayed; filters can be cleared.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST display a prioritized list of flagged claims on the dashboard, sortable and filterable by risk band, anomaly type, provider, and date range.
- **FR-002**: The platform MUST show summary statistics on the dashboard: total claims reviewed, flagged count, anomaly type distribution, and a rules-vs-ML comparison.
- **FR-003**: Investigators MUST be able to drill into any flagged claim to view its full details: identifiers, service date, procedure codes, charge and payment amounts, risk score, and the top factors contributing to that score.
- **FR-004**: Investigators MUST be able to trigger an investigation for any flagged claim and receive a streamed, step-by-step response showing triage classification, gathered evidence, and synthesized rationale.
- **FR-005**: The investigation rationale MUST include: a summary of findings, supporting evidence with specific policy citations (document, chapter, section), a recommended next step, and a confidence level.
- **FR-006**: The platform MUST clearly halt investigation and display a "Manual Review Required" notice when evidence retrieval produces no usable results, rather than generating a rationale from empty context.
- **FR-007**: Investigators MUST be able to record a decision on each investigation: accept, reject, or escalate.
- **FR-008**: The platform MUST clearly distinguish AI-generated content from human-confirmed decisions using visible labeling.
- **FR-009**: The analytics section MUST display model performance metrics (AUC-ROC, precision-recall) alongside the rules baseline ablation comparison, all explicitly labeled as synthetic-data results.
- **FR-010**: The platform MUST provide a direct NCCI code-pair conflict lookup capability (given two procedure codes and a service date, return whether an active edit exists).
- **FR-011**: All investigation results MUST be persisted so they can be retrieved without re-running the pipeline.
- **FR-012**: The investigation pipeline MUST complete (triage + evidence + rationale) within 15 seconds for any single claim under normal operating conditions.

### Key Entities

- **Claim**: A submitted Medicare Part B professional claim with member, provider, procedure codes, diagnosis codes, charge/payment amounts, and service date. Identified by a unique claim ID.
- **Risk Score**: A numeric score (0–100) assigned to each claim by the ML model, representing the likelihood of being an improper payment. Accompanied by per-factor contribution values.
- **Investigation**: The result of running the AI pipeline on a claim. Contains triage classification, gathered evidence, synthesized rationale, policy citations, recommended action, and confidence level.
- **Human Decision**: An investigator's recorded outcome for an investigation: accept, reject, or escalate. Associated with a timestamp.
- **Policy Citation**: A reference to a specific policy document, chapter, and section retrieved from the CMS policy corpus, used to support an investigation rationale.
- **NCCI Edit**: A structured rule specifying that two procedure codes may not be billed together on the same claim for the same beneficiary. Identified by code pair and effective date range.
- **Provider**: A healthcare professional with a billing history, specialty designation, and aggregated billing patterns.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The ML model achieves measurable lift over the rules-only baseline on the synthetic holdout dataset, demonstrating that it detects patterns the rules alone miss.
- **SC-002**: At least 80% of policy evidence retrieved for a set of 50 representative Medicare Part B questions is rated as relevant and accurate by a human reviewer.
- **SC-003**: At least 85% of AI-generated investigation rationales on a 50-claim sample are rated "useful" or better by a human reviewer using a defined rubric.
- **SC-004**: The full investigation pipeline (from "Investigate" click to complete rationale) completes in under 15 seconds for any single claim.
- **SC-005**: All three core investigator workflows — reviewing the flagged queue, completing an investigation, and recording a decision — are fully functional and can be demonstrated end-to-end in a live walkthrough.
- **SC-006**: The platform clearly and accurately distinguishes AI-generated content from human-confirmed decisions in every view where both may appear.
- **SC-007**: The analytics section displays an honest ablation comparison that shows both what the rules baseline detects and what the ML model adds, with synthetic-data framing explicitly visible.

---

## Assumptions

- The primary user is a payment integrity investigator or analyst at a healthcare payer organization, familiar with claims processing terminology but not necessarily with AI or ML.
- All claims data used is synthetic (Synthea-generated with programmatically injected anomalies). No real patient health information is processed.
- The policy corpus is limited to publicly available CMS material (Medicare Claims Processing Manual selected chapters, HCPCS descriptions, CMS Fraud/Waste/Abuse guidelines). AMA CPT guidelines, LCDs, NCDs, and payer-specific policies are out of scope.
- NCCI conflict checking is a simplified existence check (does an active edit exist for this code pair on this date). Full modifier-bypass logic is out of scope for v1.
- The platform is a capability demonstration, not a production-grade adjudication or audit system. Investigation rationales support human review; they are not legally defensible determinations.
- Only post-pay investigation is in scope. Real-time pre-pay decisioning is out of scope.
- Authentication and authorization are minimal (development-level); production-grade security is out of scope.
- The platform operates on a preloaded synthetic dataset of approximately 50,000–100,000 claims. Real-time ingestion of live claims is out of scope.
- Anomaly types covered: upcoding, NCCI code-pair violations, and duplicate billing. Other fraud typologies are out of scope.

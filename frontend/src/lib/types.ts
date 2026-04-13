// Shared TypeScript types mirroring backend Pydantic schemas.
// Keep in sync with backend/app/data/schemas/.

export type ClaimStatus =
  | "pending_review"
  | "accepted"
  | "rejected"
  | "escalated"
  | "manual_review_required";

export type AnomalyType = "upcoding" | "ncci_violation" | "duplicate";

export type RiskBand = "high" | "medium" | "low";

export type InvestigationStatus =
  | "pending"
  | "triage_complete"
  | "evidence_complete"
  | "complete"
  | "manual_review_required"
  | "error";

export type AnomalyFlagValue = "detected" | "not_applicable" | "insufficient_data";

export type DecisionKind = "accepted" | "rejected" | "escalated";

export type EvidenceTool =
  | "ncci_lookup"
  | "rag_retrieval"
  | "provider_history"
  | "duplicate_search";

export type SourceStatus = "success" | "unavailable";

export interface Claim {
  claim_id: string;
  member_id: string;
  provider_id: string;
  service_date: string; // ISO date
  claim_receipt_date: string;
  procedure_codes: string[];
  diagnosis_codes: string[];
  modifiers: string[];
  charge_amount: number;
  allowed_amount: number;
  paid_amount: number;
  place_of_service: string;
  claim_status: ClaimStatus;
  anomaly_type: AnomalyType | null;
}

export interface RiskScore {
  claim_id: string;
  xgboost_score: number;
  shap_values: Record<string, number>;
  rules_flags: string[];
  risk_band: RiskBand;
  scored_at: string;
}

export interface PolicyCitation {
  text: string;
  source: string;
  chapter: string | null;
  section: string | null;
  relevance_score: number;
}

export interface NCCIFinding {
  conflict_exists: boolean;
  edit_type: string | null;
  effective_date: string | null;
  rationale: string | null;
}

export interface DuplicateMatch {
  claim_id: string;
  service_date: string;
  procedure_codes: string[];
  similarity_score: number;
}

export interface SourceRecord {
  tool: EvidenceTool;
  status: SourceStatus;
  reason: string | null;
}

export interface EvidenceEnvelope {
  policy_citations: PolicyCitation[];
  ncci_findings: NCCIFinding | null;
  provider_context: string | null;
  duplicate_matches: DuplicateMatch[];
  sources_consulted: SourceRecord[];
}

export interface RationaleResult {
  summary: string;
  supporting_evidence: string[];
  policy_citations: PolicyCitation[];
  anomaly_flags_addressed: Partial<Record<AnomalyType, string | null>>;
  recommended_action: string;
  confidence: number;
  review_needed: boolean;
}

export interface TriageResult {
  anomaly_type: AnomalyType | null;
  anomaly_flags: Record<AnomalyType, AnomalyFlagValue>;
  confidence: number;
  priority: "high" | "medium" | "low";
  evidence_tools_to_use: EvidenceTool[];
}

export interface HumanDecision {
  decision: DecisionKind;
  notes: string | null;
  decided_at: string;
  investigator_id: string;
}

export interface Investigation {
  claim_id: string;
  investigation_status: InvestigationStatus;
  triage: TriageResult | null;
  evidence: EvidenceEnvelope | null;
  rationale: RationaleResult | null;
  human_decision: HumanDecision | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimDetail {
  claim: Claim;
  risk_score: RiskScore | null;
  investigation: Investigation | null;
}

export type ClaimListItem = Claim & {
  risk_score: number | null;
  risk_band: RiskBand | null;
  rules_flags: string[];
  shap_values: Record<string, number>;
};

export interface ClaimsPage {
  claims: ClaimListItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface AnalyticsOverview {
  total_claims: number;
  flagged_count: number;
  high_risk_count: number;
  investigation_rate: number;
  avg_risk_score: number;
  anomaly_distribution: Record<AnomalyType, number>;
  rules_baseline_flagged: number;
  ml_only_flagged: number;
  combined_flagged: number;
}

export interface ModelPerformance {
  auc_roc: number;
  precision_at_k: Record<string, number>;
  precision_recall_curve: Array<{ precision: number; recall: number; threshold: number }>;
  per_anomaly_recall: Record<AnomalyType, number>;
  ablation: Record<"rules_only" | "xgboost_only" | "combined", { precision: number; recall: number; f1: number }>;
  data_framing: "synthetic";
}

// --- SSE event types (discriminated union) ---

export interface TriageEvent {
  event: "triage";
  data: TriageResult;
}

export interface EvidenceEvent {
  event: "evidence";
  data: EvidenceEnvelope;
}

export interface RationaleChunkEvent {
  event: "rationale_chunk";
  data: { text: string };
}

export interface CompleteEvent {
  event: "complete";
  data: Investigation;
}

export interface HaltEvent {
  event: "halt";
  data: {
    investigation_status: "manual_review_required";
    reason: string;
    sources_consulted: SourceRecord[];
  };
}

export interface ErrorEvent {
  event: "error";
  data: { investigation_status?: "error"; message: string };
}

export type InvestigationEvent =
  | TriageEvent
  | EvidenceEvent
  | RationaleChunkEvent
  | CompleteEvent
  | HaltEvent
  | ErrorEvent;

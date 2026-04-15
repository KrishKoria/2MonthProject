import type {
  AnomalyFlagValue,
  AnomalyType,
  DecisionKind,
  EvidenceEnvelope,
  EvidenceTool,
  Investigation,
  SourceRecord,
} from "./types";
import { DECISION_COPY, TERM_COPY } from "./experience-copy";

export type InvestigationStage =
  | "idle"
  | "triage"
  | "evidence"
  | "rationale"
  | "done"
  | "halted"
  | "error";

export type DisplayedAnomalyFlagStatus = AnomalyFlagValue | "clear" | "unavailable";

export interface EvidenceSourceDisplay {
  tone: "success" | "not_applicable" | "unavailable";
  headline: string;
  detail: string | null;
}

export const DECISION_META: Record<
  DecisionKind,
  {
    label: string;
    actionLabel: string;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    summary: string;
  }
> = {
  accepted: {
    label: DECISION_COPY.accepted.recordLabel,
    actionLabel: DECISION_COPY.accepted.actionLabel,
    badgeVariant: "secondary",
    summary: DECISION_COPY.accepted.description,
  },
  rejected: {
    label: DECISION_COPY.rejected.recordLabel,
    actionLabel: DECISION_COPY.rejected.actionLabel,
    badgeVariant: "destructive",
    summary: DECISION_COPY.rejected.description,
  },
  escalated: {
    label: DECISION_COPY.escalated.recordLabel,
    actionLabel: DECISION_COPY.escalated.actionLabel,
    badgeVariant: "default",
    summary: DECISION_COPY.escalated.description,
  },
};

export function inferInvestigationStage(inv: Investigation | null): InvestigationStage {
  if (!inv) return "idle";

  switch (inv.investigation_status) {
    case "pending":
      return "triage";
    case "triage_complete":
      return "evidence";
    case "evidence_complete":
      return "rationale";
    case "complete":
      return "done";
    case "manual_review_required":
      return "halted";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function getEvidenceSource(
  evidence: Pick<EvidenceEnvelope, "sources_consulted"> | null,
  tool: EvidenceTool,
) {
  return evidence?.sources_consulted.find((source) => source.tool === tool) ?? null;
}

function isKnownNotApplicable(source: SourceRecord) {
  return (
    source.reason === "no_ncci_codes_in_claim" || source.reason === "missing_member_or_date"
  );
}

function describeReason(reason: string | null) {
  switch (reason) {
    case "no_ncci_codes_in_claim":
      return "This claim does not contain enough procedure codes for a code-pairing rule check.";
    case "missing_service_date":
      return "The claim is missing a usable service date for the code-pairing rule check.";
    case "engine_error":
      return "The billing rule engine failed while checking this claim.";
    case "missing_member_or_date":
      return "Duplicate matching needs both member and service date context.";
    case "claims_unavailable":
      return "Duplicate matching data was unavailable.";
    case "no_provider_id":
      return "The claim is missing a provider identifier.";
    case "roster_unavailable":
      return "Provider roster data was unavailable.";
    case "provider_not_found":
      return "The provider could not be found in the roster.";
    case "no_results":
      return "No matching policy text was found.";
    case "no_conflicts_found":
      return "The claim was checked against active billing rules and no conflict was found.";
    default:
      return reason ? reason.replace(/_/g, " ") : null;
  }
}

export function getDisplayedAnomalyFlagStatus(
  anomaly: AnomalyType,
  triageFlags: Partial<Record<AnomalyType, AnomalyFlagValue>> | null,
  evidence: EvidenceEnvelope | null,
): DisplayedAnomalyFlagStatus {
  if (anomaly === "ncci_violation") {
    const source = getEvidenceSource(evidence, "ncci_lookup");
    if (!source) return triageFlags?.[anomaly] ?? "not_applicable";
    if (source.status === "success") {
      return evidence?.ncci_findings?.conflict_exists ? "detected" : "clear";
    }
    return isKnownNotApplicable(source) ? "not_applicable" : "unavailable";
  }

  if (anomaly === "duplicate") {
    const source = getEvidenceSource(evidence, "duplicate_search");
    if (!source) return triageFlags?.[anomaly] ?? "not_applicable";
    if (source.status === "success") {
      return evidence?.duplicate_matches.length ? "detected" : "clear";
    }
    return isKnownNotApplicable(source) ? "not_applicable" : "unavailable";
  }

  return triageFlags?.[anomaly] ?? "not_applicable";
}

export function getEvidenceSourceDisplay(
  source: SourceRecord,
  evidence: Pick<EvidenceEnvelope, "ncci_findings" | "duplicate_matches">,
): EvidenceSourceDisplay {
  if (source.tool === "ncci_lookup") {
    if (source.status === "success" && evidence.ncci_findings?.conflict_exists) {
      return {
        tone: "success",
        headline: "Billing rule conflict found.",
        detail:
          evidence.ncci_findings.rationale ?? TERM_COPY.ncci,
      };
    }
    if (source.status === "success") {
      return {
        tone: "success",
        headline: "No billing rule conflict found.",
        detail: describeReason(source.reason),
      };
    }
    if (isKnownNotApplicable(source)) {
      return {
        tone: "not_applicable",
        headline: "Not applicable.",
        detail: describeReason(source.reason),
      };
    }
  }

  if (source.tool === "duplicate_search") {
    if (source.status === "success" && evidence.duplicate_matches.length) {
      return {
        tone: "success",
        headline: "Similar nearby claims found.",
        detail: "Nearby claims with overlapping procedure codes were identified.",
      };
    }
    if (source.status === "success") {
      return {
        tone: "success",
        headline: "No similar nearby claims found.",
        detail: "Nearby claims for the same member and provider were checked and no duplicate was found.",
      };
    }
    if (isKnownNotApplicable(source)) {
      return {
        tone: "not_applicable",
        headline: "Not applicable.",
        detail: describeReason(source.reason),
      };
    }
  }

  if (source.status === "success") {
    return {
      tone: "success",
      headline: "Checked successfully.",
      detail: describeReason(source.reason),
    };
  }

  return {
    tone: "unavailable",
    headline: "Could not check this source.",
    detail: describeReason(source.reason),
  };
}

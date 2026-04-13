import type { DecisionKind, Investigation } from "./types";

export type InvestigationStage =
  | "idle"
  | "triage"
  | "evidence"
  | "rationale"
  | "done"
  | "halted"
  | "error";

export const DECISION_META: Record<
  DecisionKind,
  {
    label: string;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    summary: string;
  }
> = {
  accepted: {
    label: "Accepted",
    badgeVariant: "secondary",
    summary: "Approve payment and close the investigation.",
  },
  rejected: {
    label: "Rejected",
    badgeVariant: "destructive",
    summary: "Deny or claw back payment based on the evidence trail.",
  },
  escalated: {
    label: "Escalated",
    badgeVariant: "default",
    summary: "Route the case to senior review with the current evidence packet.",
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

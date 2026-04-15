import type { AnomalyType, ClaimStatus, DecisionKind, RiskBand } from "./types";

export interface GuideStep {
  value: string;
  title: string;
  summary: string;
  detail: string;
  hint?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export const ANOMALY_COPY: Record<
  AnomalyType,
  { label: string; technicalLabel: string; description: string }
> = {
  upcoding: {
    label: "Possible overbilling",
    technicalLabel: "Upcoding",
    description:
      "The billed service level looks higher than the rest of the claim suggests.",
  },
  ncci_violation: {
    label: "Billing rule conflict",
    technicalLabel: "NCCI violation",
    description:
      "Two procedure codes may not be payable together under CMS code-pairing rules.",
  },
  duplicate: {
    label: "Possible duplicate bill",
    technicalLabel: "Duplicate billing",
    description:
      "A very similar claim appears close in time and may need a double-billing check.",
  },
};

export const STATUS_COPY: Record<
  ClaimStatus,
  { label: string; description: string }
> = {
  pending_review: {
    label: "Needs review",
    description: "No decision has been recorded yet.",
  },
  manual_review_required: {
    label: "Needs a person",
    description: "The system could not gather enough facts on its own.",
  },
  accepted: {
    label: "Approved",
    description: "Payment can move forward and the case can close.",
  },
  rejected: {
    label: "Stopped",
    description: "The case supports stopping or recovering payment.",
  },
  escalated: {
    label: "Escalated",
    description: "The case has been passed to senior review.",
  },
};

export const RISK_BAND_COPY: Record<
  RiskBand,
  { label: string; description: string }
> = {
  high: {
    label: "High priority",
    description: "A good place to start if you want the strongest leads first.",
  },
  medium: {
    label: "Medium priority",
    description: "Worth reviewing after the high-priority queue is clear.",
  },
  low: {
    label: "Low priority",
    description: "Lower urgency. Review if you need more coverage.",
  },
};

export const DECISION_COPY: Record<
  DecisionKind,
  { actionLabel: string; recordLabel: string; description: string }
> = {
  accepted: {
    actionLabel: "Approve",
    recordLabel: "Approve payment",
    description: "Move payment forward and close the case.",
  },
  rejected: {
    actionLabel: "Stop payment",
    recordLabel: "Stop or recover payment",
    description: "Use the evidence to stop or claw back payment.",
  },
  escalated: {
    actionLabel: "Escalate",
    recordLabel: "Send to senior review",
    description: "Hand the case to a more experienced reviewer.",
  },
};

export const TERM_COPY = {
  riskScore:
    "A 0 to 100 score that estimates how strongly this claim deserves a closer look.",
  confidence:
    "How sure the system is about its summary after checking the available evidence.",
  shap: "These are the claim details that pushed the score up or down the most.",
  aucRoc:
    "A technical ranking metric. Higher means suspicious claims are more likely to appear above clean ones.",
  precisionAtK:
    "Of the first claims in the queue, this estimates how many really need attention.",
  recall:
    "Recall is the share of real problem claims the system manages to catch.",
  precisionRecall:
    "This chart shows the tradeoff between reviewing fewer claims accurately and reviewing more claims broadly.",
  ablation:
    "This compares rules, machine learning, and the combined approach to show what each layer adds.",
  syntheticData:
    "All examples and metrics in this workspace come from synthetic data, not real member records.",
  ncci:
    "NCCI is the CMS code-pairing rule set that flags procedure codes that should not be billed together.",
  receiptDate:
    "The date the claim entered the review system. It can differ from the actual service date.",
};

const FEATURE_LABELS: Record<string, string> = {
  charge_to_allowed_ratio: "Charge compared with allowed amount",
  charge_amount: "Billed amount",
  allowed_amount: "Allowed amount",
  paid_amount: "Paid amount",
  same_day_claim_count: "Same day claim count",
  duplicate_claim_count: "Nearby similar claims",
  same_member_same_day_count: "Same member claims on the same day",
  same_provider_same_day_count: "Same provider claims on the same day",
  recent_same_code_count: "Recent claims with the same code",
  prior_provider_same_code_30d_count: "Same code billed by this provider recently",
  time_since_last_same_code_days: "Days since the same code was last billed",
  receipt_lag_days: "Days between service and receipt",
  procedure_code_count: "Number of procedure codes",
  diagnosis_code_count: "Number of diagnosis codes",
};

const RULE_FLAG_LABELS: Record<string, string> = {
  charge_outlier: "Unusually high charge",
  duplicate_window: "Very similar claim nearby",
  modifier_risk: "Modifier pattern needs review",
  ncci_pair_conflict: "Code pairing rule conflict",
};

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getFriendlyFeatureLabel(feature: string) {
  return FEATURE_LABELS[feature] ?? titleCase(feature);
}

export function getFriendlyRuleLabel(flag: string) {
  return RULE_FLAG_LABELS[flag] ?? titleCase(flag);
}

export const DASHBOARD_GUIDE_STEPS: GuideStep[] = [
  {
    value: "start",
    title: "Start with the queue",
    summary: "Use this page to see where attention is needed, then open the review queue.",
    detail:
      "The summary cards tell you how many claims are loaded, how many look risky, and which problem types show up most often.",
    hint: "If you want the fastest starting point, open the high-priority queue.",
    ctaLabel: "Open high-priority claims",
    ctaHref: "/claims?risk_band=high",
  },
  {
    value: "understand",
    title: "Read the numbers in plain language",
    summary: "The info dots explain technical terms like confidence, ranking quality, and catch rate.",
    detail:
      "You do not need to know the internal model vocabulary to use the product. The UI translates it as you go.",
  },
  {
    value: "decide",
    title: "Follow one claim end to end",
    summary: "Open any claim to see why it was flagged, what facts were found, and what to do next.",
    detail:
      "The case review flow gathers facts first, drafts a short summary, and leaves the final choice with you.",
  },
];

export const QUEUE_GUIDE_STEPS: GuideStep[] = [
  {
    value: "find",
    title: "Find a claim",
    summary: "Start with the list before using advanced filters.",
    detail:
      "The highest-priority claims are the easiest place to begin when you are new to the workflow.",
    hint: "High priority means the claim is a stronger candidate for review, not that it is definitely wrong.",
  },
  {
    value: "narrow",
    title: "Narrow only when you need to",
    summary: "Search by claim number, provider, member, or code if you are looking for something specific.",
    detail:
      "Problem type and review status filters are there to help you trim the list, not to force a complicated setup.",
  },
  {
    value: "open",
    title: "Open a case",
    summary: "Choose any row to open the full claim review and guided case summary.",
    detail:
      "That screen explains why the claim stands out and lets you approve, stop, or escalate the case.",
  },
];

export const CLAIM_GUIDE_STEPS: GuideStep[] = [
  {
    value: "risk",
    title: "See what stands out",
    summary: "Start with the score and the short explanation beside it.",
    detail:
      "The score is only a starting point. The labels underneath explain which claim details pushed attention higher.",
    hint: "Hover the info dots any time a term feels too technical.",
  },
  {
    value: "facts",
    title: "Check the supporting facts",
    summary: "The guided review checks billing rules, similar claims, provider context, and policy text.",
    detail:
      "It gathers the evidence first so you can read the facts before looking at the draft summary.",
  },
  {
    value: "decide",
    title: "Choose the next step",
    summary: "When the short summary looks trustworthy, record what should happen next.",
    detail:
      "You can approve payment, stop or recover payment, or escalate the case for senior review.",
  },
];

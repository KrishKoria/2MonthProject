import { describe, expect, test } from "bun:test";

import type { EvidenceEnvelope } from "./types";

const baseInvestigation = {
  claim_id: "CLM-100",
  triage: null,
  evidence: null,
  rationale: null,
  human_decision: null,
  created_at: "2026-04-13T00:00:00Z",
  updated_at: "2026-04-13T00:00:00Z",
};

describe("investigation stage helpers", () => {
  test("maps persisted backend statuses to the visible console stage", async () => {
    const mod = await import("./investigation");

    expect(
      mod.inferInvestigationStage({
        ...baseInvestigation,
        investigation_status: "pending",
      }),
    ).toBe("triage");

    expect(
      mod.inferInvestigationStage({
        ...baseInvestigation,
        investigation_status: "triage_complete",
      }),
    ).toBe("evidence");

    expect(
      mod.inferInvestigationStage({
        ...baseInvestigation,
        investigation_status: "evidence_complete",
      }),
    ).toBe("rationale");
  });

  test("prefers evidence-derived clear states over provisional triage flags", async () => {
    const mod = await import("./investigation");

    const evidence = {
      policy_citations: [],
      ncci_findings: null,
      provider_context: null,
      duplicate_matches: [],
      sources_consulted: [
        { tool: "ncci_lookup", status: "success", reason: "no_conflicts_found" },
        { tool: "duplicate_search", status: "success", reason: null },
      ],
    } satisfies EvidenceEnvelope;

    expect(
      mod.getDisplayedAnomalyFlagStatus(
        "ncci_violation",
        {
          upcoding: "insufficient_data",
          ncci_violation: "insufficient_data",
          duplicate: "insufficient_data",
        },
        evidence,
      ),
    ).toBe("clear");

    expect(
      mod.getDisplayedAnomalyFlagStatus(
        "duplicate",
        {
          upcoding: "insufficient_data",
          ncci_violation: "insufficient_data",
          duplicate: "insufficient_data",
        },
        evidence,
      ),
    ).toBe("clear");
  });

  test("treats known evidence gaps as not applicable instead of unavailable", async () => {
    const mod = await import("./investigation");

    expect(
      mod.getEvidenceSourceDisplay(
        {
          tool: "ncci_lookup",
          status: "unavailable",
          reason: "no_ncci_codes_in_claim",
        },
        {
          ncci_findings: null,
          duplicate_matches: [],
        },
      ),
    ).toEqual({
      tone: "not_applicable",
      headline: "Not applicable.",
      detail: "This claim does not contain enough procedure codes for a code-pairing rule check.",
    });
  });
});

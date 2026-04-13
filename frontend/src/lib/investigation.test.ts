import { describe, expect, test } from "bun:test";

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
});

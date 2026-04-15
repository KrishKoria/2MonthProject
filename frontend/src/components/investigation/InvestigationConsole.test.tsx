import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";

test("renders recorded human review details when a decision already exists", async () => {
  const mod = await import("./InvestigationConsole");

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <mod.InvestigationConsole
        claimId="CLM-200"
        initial={{
          claim_id: "CLM-200",
          investigation_status: "complete",
          triage: null,
          evidence: null,
          rationale: {
            summary: "Claim appears properly documented.",
            supporting_evidence: [],
            policy_citations: [],
            anomaly_flags_addressed: {},
            recommended_action: "Accept payment.",
            confidence: 0.88,
            review_needed: false,
          },
          human_decision: {
            decision: "accepted",
            notes: "Documentation supports billed level.",
            decided_at: "2026-04-13T08:30:00Z",
            investigator_id: "investigator-7",
          },
          created_at: "2026-04-13T00:00:00Z",
          updated_at: "2026-04-13T08:30:00Z",
        }}
      />
    </TooltipProvider>,
  );

  expect(html).toContain("Choose the next step");
  expect(html).toContain("Documentation supports billed level.");
  expect(html).toContain("investigator-7");
  expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Approve[\s\S]*?<\/button>/);
  expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Stop payment[\s\S]*?<\/button>/);
  expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Escalate[\s\S]*?<\/button>/);
});

test("renders a guided empty state before a review starts", async () => {
  const mod = await import("./InvestigationConsole");

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <mod.InvestigationConsole claimId="CLM-201" initial={null} />
    </TooltipProvider>,
  );

  expect(html).toContain("Start guided review");
  expect(html).toContain("quick scan, supporting facts, and a draft summary before you decide");
});

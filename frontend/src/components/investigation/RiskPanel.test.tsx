import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";

test("renders backend risk scores without double-scaling them", async () => {
  const mod = await import("./RiskPanel");

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <mod.RiskPanel
        riskBand="high"
        riskScore={{
          claim_id: "CLM-100",
          xgboost_score: 88.57,
          shap_values: {
            charge_to_allowed_ratio: 2.099,
          },
          rules_flags: ["charge_outlier"],
          risk_band: "high",
          scored_at: "2026-04-14T08:00:00Z",
        }}
      />
    </TooltipProvider>,
  );

  expect(html).toContain(">89<");
  expect(html.includes("8857")).toBe(false);
  expect(html).toContain("Charge compared with allowed amount");
  expect(html.includes("charge_to_allowed_ratio")).toBe(false);
});

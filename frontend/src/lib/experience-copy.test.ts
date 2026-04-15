import { expect, test } from "bun:test";

test("replaces backend anomaly labels with plain-language copy", async () => {
  const mod = await import("./experience-copy");

  expect(mod.ANOMALY_COPY.ncci_violation.label).toBe("Billing rule conflict");
  expect(mod.ANOMALY_COPY.upcoding.label).toBe("Possible overbilling");
  expect(mod.ANOMALY_COPY.duplicate.label).toBe("Possible duplicate bill");
});

test("humanizes technical model feature names", async () => {
  const mod = await import("./experience-copy");

  expect(mod.getFriendlyFeatureLabel("charge_to_allowed_ratio")).toBe(
    "Charge compared with allowed amount",
  );
  expect(mod.getFriendlyFeatureLabel("same_day_claim_count")).toBe("Same day claim count");
});

test("defines a claim review guide that ends with a decision step", async () => {
  const mod = await import("./experience-copy");

  expect(mod.CLAIM_GUIDE_STEPS.map((step) => step.title)).toEqual([
    "See what stands out",
    "Check the supporting facts",
    "Choose the next step",
  ]);
});

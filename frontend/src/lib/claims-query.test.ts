import { describe, expect, test } from "bun:test";

describe("claims query helpers", () => {
  test("reads URL filters and keeps supported values", async () => {
    const mod = await import("./claims-query");

    const query = mod.claimsQueryFromSearchParams({
      risk_band: "high",
      anomaly_type: "duplicate",
      provider_id: "PRV-771",
      page: "2",
      page_size: "50",
      sort_by: "charge_amount",
      sort_dir: "asc",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(query).toEqual({
      risk_band: "high",
      anomaly_type: "duplicate",
      provider_id: "PRV-771",
      page: 2,
      page_size: 50,
      sort_by: "charge_amount",
      sort_dir: "asc",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });
  });

  test("clamps invalid search params back to safe defaults", async () => {
    const mod = await import("./claims-query");

    const query = mod.claimsQueryFromSearchParams({
      risk_band: "urgent",
      anomaly_type: "mystery",
      status: "wat",
      page: "-9",
      page_size: "999",
      sort_by: "made_up_field",
      sort_dir: "sideways",
    });

    expect(query).toEqual({
      page: 1,
      page_size: 25,
      sort_by: "risk_score",
      sort_dir: "desc",
    });
  });

  test("serializes only non-default values into canonical URL params", async () => {
    const mod = await import("./claims-query");

    const params = mod
      .claimsQueryToSearchParams({
        page: 1,
        page_size: 25,
        sort_by: "risk_score",
        sort_dir: "desc",
        risk_band: "high",
        provider_id: "",
        date_from: undefined,
      })
      .toString();

    expect(params).toBe("risk_band=high");
  });
});

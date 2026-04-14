import { describe, expect, test } from "bun:test";

describe("claims query helpers", () => {
  test("reads URL filters and keeps supported values", async () => {
    const mod = await import("./claims-query");

    const query = mod.claimsQueryFromSearchParams({
      search: "CLM-4242",
      risk_band: "high",
      anomaly_type: "duplicate",
      page: "2",
      page_size: "50",
      sort_by: "charge_amount",
      sort_dir: "asc",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });

    expect(query).toEqual({
      search: "CLM-4242",
      risk_band: "high",
      anomaly_type: "duplicate",
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

  test("maps legacy claim/provider params into the unified search box", async () => {
    const mod = await import("./claims-query");

    expect(
      mod.claimsQueryFromSearchParams({
        claim_id: "CLM-0002",
      }),
    ).toEqual({
      page: 1,
      page_size: 25,
      sort_by: "risk_score",
      sort_dir: "desc",
      search: "CLM-0002",
    });

    expect(
      mod.claimsQueryFromSearchParams({
        provider_id: "PRV-001",
      }),
    ).toEqual({
      page: 1,
      page_size: 25,
      sort_by: "risk_score",
      sort_dir: "desc",
      search: "PRV-001",
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
        search: "CLM-100",
        risk_band: "high",
        date_from: undefined,
      })
      .toString();

    expect(params).toBe("search=CLM-100&risk_band=high");
  });
});

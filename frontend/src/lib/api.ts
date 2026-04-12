// Typed REST client for the backend API.
// All routes return data wrapped in { data, ... } envelopes per contracts/api.md;
// this client unwraps to the `data` payload for callers.

import type {
  AnalyticsOverview,
  Claim,
  ClaimDetail,
  ClaimsPage,
  DecisionKind,
  Investigation,
  ModelPerformance,
  NCCIFinding,
} from "./types";

const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  data: T;
  [key: string]: unknown;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : res.statusText) || `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  if (body && typeof body === "object" && "data" in body) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  const search = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${search}`;
}

export interface ClaimsQuery {
  page?: number;
  page_size?: number;
  status?: string;
  risk_band?: string;
  anomaly_type?: string;
  provider_id?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export const api = {
  listClaims(query: ClaimsQuery = {}): Promise<ClaimsPage> {
    return request<ClaimsPage>(`/api/claims${buildQuery(query)}`);
  },

  getClaim(claimId: string): Promise<ClaimDetail> {
    return request<ClaimDetail>(`/api/claims/${encodeURIComponent(claimId)}`);
  },

  getInvestigation(claimId: string): Promise<Investigation | null> {
    return request<Investigation | null>(
      `/api/claims/${encodeURIComponent(claimId)}/investigation`,
    );
  },

  submitDecision(
    claimId: string,
    decision: DecisionKind,
    notes?: string,
  ): Promise<Investigation> {
    return request<Investigation>(
      `/api/claims/${encodeURIComponent(claimId)}/investigation`,
      {
        method: "PATCH",
        body: JSON.stringify({ decision, notes }),
      },
    );
  },

  analyticsOverview(): Promise<AnalyticsOverview> {
    return request<AnalyticsOverview>(`/api/analytics/overview`);
  },

  modelPerformance(): Promise<ModelPerformance> {
    return request<ModelPerformance>(`/api/analytics/model-performance`);
  },

  ncciLookup(code1: string, code2: string, serviceDate: string): Promise<NCCIFinding> {
    return request<NCCIFinding>(
      `/api/ncci/${encodeURIComponent(code1)}/${encodeURIComponent(code2)}${buildQuery({
        service_date: serviceDate,
      })}`,
    );
  },
};

export type { Claim, Investigation };

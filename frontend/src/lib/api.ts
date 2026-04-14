// Typed REST client for the backend API.
// All routes return data wrapped in { data, ... } envelopes per contracts/api.md;
// this client unwraps to the `data` payload for callers.

import type {
  AnalyticsOverview,
  AnomalyType,
  Claim,
  ClaimDetail,
  ClaimStatus,
  ClaimsPage,
  DecisionKind,
  Investigation,
  ModelPerformance,
  NCCIFinding,
  RiskBand,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

function normalizeBaseUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return undefined;
  }
  return normalized.replace(/\/+$/, "");
}

function resolveBaseUrl(): string {
  if (typeof window !== "undefined") {
    return normalizeBaseUrl(process.env?.NEXT_PUBLIC_API_BASE_URL) ?? "";
  }

  if (typeof process === "undefined") {
    return "";
  }

  return (
    normalizeBaseUrl(process.env?.API_BASE_URL) ??
    normalizeBaseUrl(process.env?.NEXT_PUBLIC_API_BASE_URL) ??
    ""
  );
}

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

function buildHeaders(init: RequestInit) {
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const method = init.method?.toUpperCase() ?? "GET";
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  baseUrl?: string,
): Promise<T> {
  const resolvedBaseUrl = baseUrl ?? resolveBaseUrl();
  const url = `${resolvedBaseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: buildHeaders(init),
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

type QueryValue = string | number | undefined | null;

function buildQuery(params: Record<string, QueryValue> | ClaimsQuery): string {
  const entries = Object.entries(params as Record<string, QueryValue>).filter(
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
  claim_id?: string;
  status?: ClaimStatus;
  risk_band?: RiskBand;
  anomaly_type?: AnomalyType;
  provider_id?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: "risk_score" | "service_date" | "claim_receipt_date" | "charge_amount";
  sort_dir?: "asc" | "desc";
}

function createApi(baseUrl?: string) {
  return {
    listClaims(query: ClaimsQuery = {}): Promise<ClaimsPage> {
      return request<ClaimsPage>(`/api/claims${buildQuery(query)}`, undefined, baseUrl);
    },

    getClaim(claimId: string): Promise<ClaimDetail> {
      return request<ClaimDetail>(`/api/claims/${encodeURIComponent(claimId)}`, undefined, baseUrl);
    },

    getInvestigation(claimId: string): Promise<Investigation | null> {
      return request<Investigation | null>(
        `/api/claims/${encodeURIComponent(claimId)}/investigation`,
        undefined,
        baseUrl,
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
        baseUrl,
      );
    },

    analyticsOverview(): Promise<AnalyticsOverview> {
      return request<AnalyticsOverview>(`/api/analytics/overview`, undefined, baseUrl);
    },

    modelPerformance(): Promise<ModelPerformance> {
      return request<ModelPerformance>(`/api/analytics/model-performance`, undefined, baseUrl);
    },

    ncciLookup(code1: string, code2: string, serviceDate: string): Promise<NCCIFinding> {
      return request<NCCIFinding>(
        `/api/ncci/${encodeURIComponent(code1)}/${encodeURIComponent(code2)}${buildQuery({
          service_date: serviceDate,
        })}`,
        undefined,
        baseUrl,
      );
    },
  };
}

export const api = createApi();
export function apiFor(baseUrl: string) {
  return createApi(baseUrl);
}

export type { Claim, Investigation };

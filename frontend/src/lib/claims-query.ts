import type { ClaimsQuery } from "./api";
import type { AnomalyType, ClaimStatus, RiskBand } from "./types";

type SearchParamValue = string | string[] | undefined;
type SearchParamsInput = Record<string, SearchParamValue>;

export const DEFAULT_CLAIMS_QUERY: Required<
  Pick<ClaimsQuery, "page" | "page_size" | "sort_by" | "sort_dir">
> = {
  page: 1,
  page_size: 25,
  sort_by: "risk_score",
  sort_dir: "desc",
};

export const CLAIMS_PAGE_SIZES = [25, 50, 100] as const;

const RISK_BANDS = new Set<RiskBand>(["high", "medium", "low"]);
const ANOMALY_TYPES = new Set<AnomalyType>([
  "upcoding",
  "ncci_violation",
  "duplicate",
]);
const CLAIM_STATUSES = new Set<ClaimStatus>([
  "pending_review",
  "accepted",
  "rejected",
  "escalated",
  "manual_review_required",
]);
const SORT_FIELDS = new Set<NonNullable<ClaimsQuery["sort_by"]>>([
  "risk_score",
  "service_date",
  "claim_receipt_date",
  "charge_amount",
]);
const SORT_DIRECTIONS = new Set<NonNullable<ClaimsQuery["sort_dir"]>>([
  "asc",
  "desc",
]);

function readFirst(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  allowed?: readonly number[],
) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  if (allowed && !allowed.includes(parsed)) return fallback;
  return parsed;
}

function parseChoice<T extends string>(value: string | undefined, allowed: Set<T>) {
  if (!value || !allowed.has(value as T)) return undefined;
  return value as T;
}

function addIfValue(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value === undefined || value === "") return;
  params.set(key, String(value));
}

export function claimsQueryFromSearchParams(searchParams: SearchParamsInput): ClaimsQuery {
  const page = parsePositiveInt(readFirst(searchParams.page), DEFAULT_CLAIMS_QUERY.page);
  const pageSize = parsePositiveInt(
    readFirst(searchParams.page_size),
    DEFAULT_CLAIMS_QUERY.page_size,
    CLAIMS_PAGE_SIZES,
  );
  const sortBy =
    parseChoice(readFirst(searchParams.sort_by), SORT_FIELDS) ??
    DEFAULT_CLAIMS_QUERY.sort_by;
  const sortDir =
    parseChoice(readFirst(searchParams.sort_dir), SORT_DIRECTIONS) ??
    DEFAULT_CLAIMS_QUERY.sort_dir;
  const search = readFirst(searchParams.search)?.trim();
  const claimId = readFirst(searchParams.claim_id)?.trim();
  const providerId = readFirst(searchParams.provider_id)?.trim();
  const dateFrom = readFirst(searchParams.date_from);
  const dateTo = readFirst(searchParams.date_to);

  return {
    page,
    page_size: pageSize,
    sort_by: sortBy,
    sort_dir: sortDir,
    search: search || claimId || providerId || undefined,
    risk_band: parseChoice(readFirst(searchParams.risk_band), RISK_BANDS),
    anomaly_type: parseChoice(readFirst(searchParams.anomaly_type), ANOMALY_TYPES),
    status: parseChoice(readFirst(searchParams.status), CLAIM_STATUSES),
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };
}

export function claimsQueryToSearchParams(query: ClaimsQuery) {
  const params = new URLSearchParams();

  addIfValue(params, "search", query.search?.trim());
  addIfValue(params, "risk_band", query.risk_band);
  addIfValue(params, "anomaly_type", query.anomaly_type);
  addIfValue(params, "status", query.status);
  addIfValue(params, "date_from", query.date_from);
  addIfValue(params, "date_to", query.date_to);

  if ((query.page ?? DEFAULT_CLAIMS_QUERY.page) !== DEFAULT_CLAIMS_QUERY.page) {
    addIfValue(params, "page", query.page);
  }
  if (
    (query.page_size ?? DEFAULT_CLAIMS_QUERY.page_size) !== DEFAULT_CLAIMS_QUERY.page_size
  ) {
    addIfValue(params, "page_size", query.page_size);
  }
  if ((query.sort_by ?? DEFAULT_CLAIMS_QUERY.sort_by) !== DEFAULT_CLAIMS_QUERY.sort_by) {
    addIfValue(params, "sort_by", query.sort_by);
  }
  if ((query.sort_dir ?? DEFAULT_CLAIMS_QUERY.sort_dir) !== DEFAULT_CLAIMS_QUERY.sort_dir) {
    addIfValue(params, "sort_dir", query.sort_dir);
  }

  return params;
}

export function getClaimsFilterCount(query: ClaimsQuery) {
  return [
    query.search,
    query.risk_band,
    query.anomaly_type,
    query.status,
    query.date_from,
    query.date_to,
  ].filter(Boolean).length;
}

export function claimsQueriesEqual(a: ClaimsQuery, b: ClaimsQuery) {
  return claimsQueryToSearchParams(a).toString() === claimsQueryToSearchParams(b).toString();
}

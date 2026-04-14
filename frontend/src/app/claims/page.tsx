import { ClaimsExplorer } from "@/components/claims/ClaimsExplorer";
import { apiFor } from "@/lib/api";
import { claimsQueryFromSearchParams, claimsQueryToSearchParams } from "@/lib/claims-query";
import { getServerApiBaseUrl } from "@/lib/server-api";
import type { ClaimListItem } from "@/lib/types";

type ClaimsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClaimsPage({ searchParams }: ClaimsPageProps) {
  const api = apiFor(await getServerApiBaseUrl());
  const query = claimsQueryFromSearchParams(await searchParams);
  let rows: ClaimListItem[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const result = await api.listClaims(query);
    rows = result.claims;
    total = result.total;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Failed to load claims";
  }

  const queryKey = claimsQueryToSearchParams(query).toString() || "claims-default";

  return (
    <ClaimsExplorer
      key={queryKey}
      initialQuery={query}
      rows={rows}
      total={total}
      error={error}
    />
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type ClaimsQuery } from "@/lib/api";
import type {
  AnomalyType,
  ClaimListItem,
  ClaimStatus,
  RiskBand,
} from "@/lib/types";

const RISK_BAND_STYLES: Record<RiskBand, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

const STATUS_STYLES: Record<ClaimStatus, string> = {
  pending_review: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  escalated: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  manual_review_required: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  upcoding: "Upcoding",
  ncci_violation: "NCCI Violation",
  duplicate: "Duplicate",
};

export function ClaimsTable() {
  const [query, setQuery] = useState<ClaimsQuery>({ page: 1, page_size: 25 });
  const [rows, setRows] = useState<ClaimListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listClaims(query)
      .then((res) => {
        if (cancelled) return;
        setRows(res.claims);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load claims");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const update = (patch: Partial<ClaimsQuery>) =>
    setQuery((q) => ({ ...q, ...patch, page: 1 }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Risk band"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={query.risk_band ?? ""}
          onChange={(e) => update({ risk_band: e.target.value || undefined })}
        >
          <option value="">All risk bands</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          aria-label="Anomaly type"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={query.anomaly_type ?? ""}
          onChange={(e) => update({ anomaly_type: e.target.value || undefined })}
        >
          <option value="">All anomalies</option>
          <option value="upcoding">Upcoding</option>
          <option value="ncci_violation">NCCI Violation</option>
          <option value="duplicate">Duplicate</option>
        </select>
        <input
          aria-label="Provider ID"
          placeholder="Provider ID"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={query.provider_id ?? ""}
          onChange={(e) => update({ provider_id: e.target.value || undefined })}
        />
        <input
          aria-label="Date from"
          type="date"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={query.date_from ?? ""}
          onChange={(e) => update({ date_from: e.target.value || undefined })}
        />
        <input
          aria-label="Date to"
          type="date"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={query.date_to ?? ""}
          onChange={(e) => update({ date_to: e.target.value || undefined })}
        />
        <select
          aria-label="Sort by"
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={query.sort_by ?? "risk_score"}
          onChange={(e) => update({ sort_by: e.target.value })}
        >
          <option value="risk_score">Risk score</option>
          <option value="service_date">Service date</option>
          <option value="claim_receipt_date">Receipt date</option>
        </select>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Claim</th>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Anomaly</th>
              <th className="px-3 py-2 text-right">Charge</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                  No claims match the current filters.
                </td>
              </tr>
            ) : null}
            {rows.map((c) => (
              <tr key={c.claim_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/claims/${c.claim_id}`} className="text-blue-600 hover:underline">
                    {c.claim_id}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{c.member_id}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.provider_id}</td>
                <td className="px-3 py-2">{c.service_date}</td>
                <td className="px-3 py-2">
                  {c.risk_band ? (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${RISK_BAND_STYLES[c.risk_band]}`}>
                      {c.risk_band}
                      {c.risk_score != null ? ` · ${c.risk_score.toFixed(0)}` : ""}
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.anomaly_type ? ANOMALY_LABELS[c.anomaly_type] : <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">${c.charge_amount.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.claim_status]}`}>
                    {c.claim_status.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div>{loading ? "Loading…" : `${total.toLocaleString()} claims`}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
            disabled={(query.page ?? 1) <= 1 || loading}
            onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
          >
            Prev
          </button>
          <span>Page {query.page ?? 1}</span>
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
            disabled={(query.page ?? 1) * (query.page_size ?? 25) >= total || loading}
            onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

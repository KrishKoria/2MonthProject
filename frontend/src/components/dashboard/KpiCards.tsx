import type { AnalyticsOverview } from "@/lib/types";

interface Props {
  overview: AnalyticsOverview;
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function KpiCards({ overview }: Props) {
  const investigationRatePct = `${(overview.investigation_rate * 100).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card label="Total claims" value={overview.total_claims.toLocaleString()} />
      <Card label="Flagged" value={overview.flagged_count.toLocaleString()} sub={`${overview.high_risk_count} high-risk`} />
      <Card label="High-risk" value={overview.high_risk_count.toLocaleString()} />
      <Card label="Investigation rate" value={investigationRatePct} sub={`avg risk ${overview.avg_risk_score}`} />
    </div>
  );
}

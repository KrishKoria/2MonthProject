import type { AnalyticsOverview } from "@/lib/types";

interface Props {
  overview: AnalyticsOverview;
}

export function RiskDistributionChart({ overview }: Props) {
  const high = overview.high_risk_count;
  const flagged = overview.flagged_count;
  const medium = Math.max(flagged - high, 0);
  const low = Math.max(overview.total_claims - flagged, 0);
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: "High", value: high, color: "bg-red-500" },
    { label: "Medium", value: medium, color: "bg-amber-500" },
    { label: "Low", value: low, color: "bg-emerald-500" },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Risk band distribution
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <div className="w-16 text-xs text-zinc-500">{r.label}</div>
            <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
              <div
                className={`${r.color} h-full`}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
            <div className="w-14 text-right text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
              {r.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

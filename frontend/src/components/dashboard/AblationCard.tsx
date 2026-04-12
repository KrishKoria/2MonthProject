import type { AnalyticsOverview } from "@/lib/types";

interface Props {
  overview: AnalyticsOverview;
}

const ANOMALY_LABELS: Record<string, string> = {
  upcoding: "Upcoding",
  ncci_violation: "NCCI Violation",
  duplicate: "Duplicate",
};

export function AblationCard({ overview }: Props) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "Rules baseline", value: overview.rules_baseline_flagged },
    { label: "ML only (high-risk)", value: overview.ml_only_flagged },
    { label: "Combined", value: overview.combined_flagged },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Detection coverage (ablation)
      </div>
      <ul className="mb-4 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">{r.label}</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {r.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Anomaly distribution
      </div>
      <ul className="mt-1 space-y-1 text-sm">
        {Object.entries(overview.anomaly_distribution).map(([k, v]) => (
          <li key={k} className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">{ANOMALY_LABELS[k] ?? k}</span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-100">
              {v.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

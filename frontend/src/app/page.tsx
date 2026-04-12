import { KpiCards } from "@/components/dashboard/KpiCards";
import { AblationCard } from "@/components/dashboard/AblationCard";
import { RiskDistributionChart } from "@/components/charts/RiskDistributionChart";
import { api } from "@/lib/api";
import type { AnalyticsOverview } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  let overview: AnalyticsOverview | null = null;
  let error: string | null = null;
  try {
    overview = await api.analyticsOverview();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load analytics";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : overview ? (
        <div className="space-y-6">
          <KpiCards overview={overview} />
          <div className="grid gap-4 md:grid-cols-2">
            <RiskDistributionChart overview={overview} />
            <AblationCard overview={overview} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

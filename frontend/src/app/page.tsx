import Link from "next/link";
import { ArrowUpRight, CircleAlert, Sparkles, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { AblationTable } from "@/components/dashboard/AblationTable";
import { ModelMetricsCard } from "@/components/dashboard/ModelMetricsCard";
import { PerAnomalyRecallCard } from "@/components/dashboard/PerAnomalyRecallCard";
import { PrecisionRecallChart } from "@/components/charts/PrecisionRecallChart";
import { api } from "@/lib/api";
import type { AnalyticsOverview, AnomalyType, ModelPerformance } from "@/lib/types";

export const dynamic = "force-dynamic";

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  upcoding: "Upcoding",
  ncci_violation: "NCCI conflict",
  duplicate: "Duplicate billing",
};

export default async function DashboardPage() {
  const [overviewResult, performanceResult] = await Promise.allSettled([
    api.analyticsOverview(),
    api.modelPerformance(),
  ]);

  const overview: AnalyticsOverview | null =
    overviewResult.status === "fulfilled" ? overviewResult.value : null;
  const performance: ModelPerformance | null =
    performanceResult.status === "fulfilled" ? performanceResult.value : null;
  const error =
    overviewResult.status === "rejected"
      ? overviewResult.reason instanceof Error
        ? overviewResult.reason.message
        : "Failed to load analytics"
      : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-10 pb-16">
      <HeroSection />
      {error ? (
        <Alert variant="destructive" className="mt-8">
          <CircleAlert />
          <AlertTitle>Unable to reach the analytics service</AlertTitle>
          <AlertDescription>
            <span className="font-mono text-xs">{error}</span>
          </AlertDescription>
        </Alert>
      ) : overview ? (
        <div className="mt-10 space-y-10">
          <KpiRow overview={overview} />
          <div className="grid gap-5 lg:grid-cols-5">
            <RiskDistribution overview={overview} />
            <AblationPanel overview={overview} />
          </div>
          <AnomalyBreakdown overview={overview} />
          {performance ? <ModelPerformanceSection performance={performance} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ModelPerformanceSection({ performance }: { performance: ModelPerformance }) {
  return (
    <section
      aria-labelledby="model-performance-heading"
      className="flex flex-col gap-6 pt-4"
    >
      <div className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Evaluation · held-out split
        </span>
        <h2
          id="model-performance-heading"
          className="font-display text-4xl leading-[1.05] tracking-tight"
        >
          Model performance,{" "}
          <em className="text-muted-foreground">stated plainly.</em>
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All numbers below are computed on a synthetic Medicare Part B test set
          with injected anomalies. They&apos;re here to show architecture credibility,
          not to advertise a production system.
        </p>
      </div>

      <ModelMetricsCard performance={performance} />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PrecisionRecallChart curve={performance.precision_recall_curve} />
        </div>
        <div className="lg:col-span-2">
          <AblationTable ablation={performance.ablation} />
        </div>
      </div>

      <PerAnomalyRecallCard recall={performance.per_anomaly_recall} />
    </section>
  );
}

function HeroSection() {
  return (
    <section className="animate-rise">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-[var(--chart-2)] animate-soft-pulse" />
        Payment integrity · live feed
      </div>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
            The ledger, <em className="text-muted-foreground">read closely.</em>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
            A deterministic-first investigation workbench for Medicare Part B —
            risk scoring, policy evidence, and AI-synthesized rationales, all
            gated by human review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/claims">
              Explore claims
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/claims?risk_band=high">
              <TriangleAlert data-icon="inline-start" />
              Review high-risk
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function KpiRow({ overview }: { overview: AnalyticsOverview }) {
  const investigationPct = overview.investigation_rate * 100;
  const flaggedPct =
    overview.total_claims > 0 ? (overview.flagged_count / overview.total_claims) * 100 : 0;

  const items = [
    {
      label: "Total claims",
      value: overview.total_claims.toLocaleString(),
      hint: "Medicare Part B · synthetic",
      footer: null as React.ReactNode,
    },
    {
      label: "Flagged",
      value: overview.flagged_count.toLocaleString(),
      hint: `${flaggedPct.toFixed(1)}% of population`,
      footer: <Progress value={flaggedPct} className="h-1" />,
    },
    {
      label: "High-risk",
      value: overview.high_risk_count.toLocaleString(),
      hint: "XGBoost score ≥ threshold",
      footer: (
        <Badge variant="secondary" className="gap-1.5 font-mono text-[10px]">
          <span className="inline-block size-1.5 rounded-full bg-[var(--chart-1)]" />
          priority queue
        </Badge>
      ),
    },
    {
      label: "Investigation rate",
      value: `${investigationPct.toFixed(1)}%`,
      hint: `avg risk ${overview.avg_risk_score.toFixed(2)}`,
      footer: <Progress value={investigationPct} className="h-1" />,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => (
        <Card
          key={item.label}
          className="animate-rise relative overflow-hidden"
          style={{ animationDelay: `${80 + i * 70}ms` }}
        >
          <CardHeader>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              {item.label}
            </CardDescription>
            <CardTitle className="font-display text-5xl font-normal tabular-nums tracking-tight">
              {item.value}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{item.hint}</CardContent>
          {item.footer ? <CardFooter>{item.footer}</CardFooter> : null}
        </Card>
      ))}
    </div>
  );
}

function RiskDistribution({ overview }: { overview: AnalyticsOverview }) {
  const high = overview.high_risk_count;
  const flagged = overview.flagged_count;
  const medium = Math.max(flagged - high, 0);
  const low = Math.max(overview.total_claims - flagged, 0);
  const total = Math.max(high + medium + low, 1);

  const bands = [
    { label: "High", value: high, color: "var(--chart-1)", note: "Escalate first" },
    { label: "Medium", value: medium, color: "var(--chart-2)", note: "Investigate" },
    { label: "Low", value: low, color: "var(--chart-3)", note: "Routine pay" },
  ];

  return (
    <Card className="lg:col-span-3 animate-rise" style={{ animationDelay: "260ms" }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Risk composition
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              Where attention is owed
            </CardTitle>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {total.toLocaleString()} scored
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {bands.map((b) => (
            <div
              key={b.label}
              className="h-full transition-all duration-700"
              style={{ width: `${(b.value / total) * 100}%`, background: b.color }}
              aria-label={`${b.label}: ${b.value}`}
            />
          ))}
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-4">
          {bands.map((b) => (
            <div key={b.label} className="border-l border-border/70 pl-3">
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full" style={{ background: b.color }} />
                {b.label}
              </dt>
              <dd className="mt-1 font-display text-3xl tabular-nums">
                {b.value.toLocaleString()}
              </dd>
              <p className="text-xs text-muted-foreground">{b.note}</p>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AblationPanel({ overview }: { overview: AnalyticsOverview }) {
  const rows = [
    { label: "Rules baseline", value: overview.rules_baseline_flagged, subtle: true },
    { label: "ML only", value: overview.ml_only_flagged, subtle: true },
    { label: "Combined", value: overview.combined_flagged, subtle: false },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Card className="lg:col-span-2 animate-rise" style={{ animationDelay: "340ms" }}>
      <CardHeader>
        <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
          Ablation
        </CardDescription>
        <CardTitle className="font-display text-3xl font-normal italic">
          Layered detection
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className={r.subtle ? "text-muted-foreground" : "font-medium"}>
                {r.label}
              </span>
              <span className="font-display text-xl tabular-nums">
                {r.value.toLocaleString()}
              </span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: r.subtle ? "var(--chart-5)" : "var(--chart-2)",
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground gap-1.5">
        <Sparkles className="size-3" />
        Combined layer surfaces cases neither rules nor ML catch alone.
      </CardFooter>
    </Card>
  );
}

function AnomalyBreakdown({ overview }: { overview: AnalyticsOverview }) {
  const entries = Object.entries(overview.anomaly_distribution) as Array<[AnomalyType, number]>;
  const total = entries.reduce((acc, [, v]) => acc + v, 0) || 1;

  return (
    <Card className="animate-rise" style={{ animationDelay: "420ms" }}>
      <CardHeader>
        <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
          Anomaly mix
        </CardDescription>
        <CardTitle className="font-display text-3xl font-normal italic">
          Three shapes of suspicion
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-0 md:grid-cols-3">
          {entries.map(([key, value], idx) => {
            const share = (value / total) * 100;
            return (
              <div
                key={key}
                className={`flex flex-col gap-3 py-4 md:px-6 ${
                  idx > 0 ? "md:border-l border-border/70" : ""
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{ANOMALY_LABELS[key]}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {share.toFixed(1)}%
                  </Badge>
                </div>
                <span className="font-display text-5xl leading-none tabular-nums">
                  {value.toLocaleString()}
                </span>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  {key === "upcoding"
                    ? "Service level coded above what was delivered."
                    : key === "ncci_violation"
                    ? "Code pairs that must not be billed together."
                    : "Near-duplicates inside tight service-date windows."}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

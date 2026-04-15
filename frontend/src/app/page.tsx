import Link from "next/link";
import { ArrowUpRight, CircleAlert, Sparkles, TriangleAlert } from "lucide-react";

import { GuidePanel } from "@/components/guidance/GuidePanel";
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
import { apiFor } from "@/lib/api";
import { ANOMALY_COPY, DASHBOARD_GUIDE_STEPS } from "@/lib/experience-copy";
import { getServerApiBaseUrl } from "@/lib/server-api";
import type { AnalyticsOverview, AnomalyType, ModelPerformance } from "@/lib/types";

export const dynamic = "force-dynamic";

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  upcoding: ANOMALY_COPY.upcoding.label,
  ncci_violation: ANOMALY_COPY.ncci_violation.label,
  duplicate: ANOMALY_COPY.duplicate.label,
};

export default async function DashboardPage() {
  const api = apiFor(await getServerApiBaseUrl());
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
        <div className="mt-10 flex flex-col gap-10">
          <GuidePanel
            eyebrow="Start here"
            title="You do not have to decode this screen alone."
            description="Use this page to get oriented, then open the review queue. Every technical term that matters now has a plain-language explanation."
            steps={DASHBOARD_GUIDE_STEPS}
          />
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
          Reliability snapshot
        </span>
        <h2
          id="model-performance-heading"
          className="font-display text-4xl leading-[1.05] tracking-tight"
        >
          How reliable the queue looks,{" "}
          <em className="text-muted-foreground">in plain language.</em>
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          These numbers describe how well the queue surfaces claims that deserve
          attention. They are calculated on synthetic Medicare Part B data and
          exist to explain the demo, not to overstate certainty.
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
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <Badge variant="outline" className="font-mono text-[10px]">
          Project overview
        </Badge>
        <span className="inline-block size-1.5 rounded-full bg-[var(--chart-2)] animate-soft-pulse" />
        Claims investigation workspace
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-border/70 bg-card/80 p-6 shadow-[0_24px_50px_-42px_rgba(25,42,71,0.28)]">
          <h1 className="font-display text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
            Claims review project
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
            Use this demo to move through the workflow in order: open the queue,
            review a claim, read the supporting facts, and save the next step.
            The interface explains technical terms where they appear.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/claims">
                Open review queue
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/claims?risk_band=high">
                <TriangleAlert data-icon="inline-start" />
                Open high-priority claims
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            {
              title: "1. Open the queue",
              body: "Start with the highest-priority claims if you want the quickest path through the project.",
            },
            {
              title: "2. Read one case",
              body: "The claim view explains why the score is high and which facts the system found.",
            },
            {
              title: "3. Save the next step",
              body: "Approve, stop, or escalate the case after reading the summary and evidence.",
            },
          ].map((item) => (
            <Card key={item.title} className="border border-border/70 bg-background/75">
              <CardHeader className="gap-2">
                <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
                  {item.title}
                </CardDescription>
                <CardTitle className="text-base font-medium">{item.body}</CardTitle>
              </CardHeader>
            </Card>
          ))}
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
      label: "Claims loaded",
      value: overview.total_claims.toLocaleString(),
      hint: "Synthetic Medicare Part B sample",
      footer: null as React.ReactNode,
    },
    {
      label: "Needs a closer look",
      value: overview.flagged_count.toLocaleString(),
      hint: `${flaggedPct.toFixed(1)}% of claims were flagged for review`,
      footer: <Progress value={flaggedPct} className="h-1" />,
    },
    {
      label: "High-priority queue",
      value: overview.high_risk_count.toLocaleString(),
      hint: "The strongest starting points in the queue",
      footer: (
        <Badge variant="secondary" className="gap-1.5 font-mono text-[10px]">
          <span className="inline-block size-1.5 rounded-full bg-[var(--chart-1)]" />
          start here
        </Badge>
      ),
    },
    {
      label: "Already reviewed",
      value: `${investigationPct.toFixed(1)}%`,
      hint: `Average score ${overview.avg_risk_score.toFixed(0)} out of 100`,
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
    { label: "High priority", value: high, color: "var(--chart-1)", note: "Best place to start" },
    { label: "Medium priority", value: medium, color: "var(--chart-2)", note: "Review next" },
    { label: "Low priority", value: low, color: "var(--chart-3)", note: "Lower urgency" },
  ];

  return (
    <Card className="lg:col-span-3 animate-rise" style={{ animationDelay: "260ms" }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Where to look first
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              How the review queue is split
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
          Why the combined check helps
        </CardDescription>
        <CardTitle className="font-display text-3xl font-normal italic">
          Rules plus learning catch more
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
        The combined approach surfaces claims that either layer misses on its own.
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
          Flagged claim types
        </CardDescription>
        <CardTitle className="font-display text-3xl font-normal italic">
          Why claims are getting attention
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
                  {ANOMALY_COPY[key].description}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

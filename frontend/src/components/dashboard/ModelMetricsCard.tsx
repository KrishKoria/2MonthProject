import { Activity, Crosshair } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelPerformance } from "@/lib/types";

interface ModelMetricsCardProps {
  performance: ModelPerformance;
}

function DialArc({ value }: { value: number }) {
  // AUC-ROC in [0, 1]. Render as 180° dial stroke-dashoffset.
  const clamped = Math.max(0, Math.min(1, value));
  const radius = 54;
  const circ = Math.PI * radius;
  const offset = circ - circ * clamped;

  return (
    <svg
      viewBox="0 0 140 90"
      width="100%"
      height="auto"
      aria-hidden
      className="text-foreground"
    >
      <path
        d={`M 16 80 A ${radius} ${radius} 0 0 1 124 80`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <path
        d={`M 16 80 A ${radius} ${radius} 0 0 1 124 80`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
      {/* ticks at 0.5 and 0.8 */}
      {[0.5, 0.8].map((t) => {
        const angle = Math.PI * (1 - t);
        const x1 = 70 + Math.cos(angle) * (radius - 4);
        const y1 = 80 - Math.sin(angle) * (radius - 4);
        const x2 = 70 + Math.cos(angle) * (radius + 6);
        const y2 = 80 - Math.sin(angle) * (radius + 6);
        return (
          <g key={t}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted-foreground)" strokeWidth="1" />
            <text
              x={x2 + (t < 0.6 ? -4 : 2)}
              y={y2 - 2}
              fontSize="8"
              fontFamily="var(--font-mono, ui-monospace)"
              fill="var(--muted-foreground)"
            >
              {t.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ModelMetricsCard({ performance }: ModelMetricsCardProps) {
  const auc = performance.auc_roc;
  const pak = performance.precision_at_k as { k?: number; precision?: number };
  const k = typeof pak.k === "number" ? pak.k : 100;
  const pakValue = typeof pak.precision === "number" ? pak.precision : 0;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="animate-rise relative overflow-hidden" style={{ animationDelay: "80ms" }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.15),transparent)]"
        />
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
            <Activity className="size-3" />
            AUC-ROC
          </CardDescription>
          <CardTitle className="font-display text-3xl font-normal italic">
            How well it ranks
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-[1.1fr_1fr] items-end gap-5">
          <div>
            <div className="font-display text-7xl leading-none tabular-nums tracking-tight">
              {auc.toFixed(3)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Area under the ROC curve on a held-out synthetic split.
              Higher means suspicious claims consistently outrank clean ones.
            </p>
          </div>
          <div className="-mb-2 self-center">
            <DialArc value={auc} />
          </div>
        </CardContent>
        <CardFooter className="justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>0.5 random · 1.0 perfect</span>
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
            <span className="inline-block size-1.5 rounded-full bg-[var(--chart-2)]" />
            Synthetic data
          </Badge>
        </CardFooter>
      </Card>

      <Card className="animate-rise relative overflow-hidden" style={{ animationDelay: "150ms" }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.15),transparent)]"
        />
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
            <Crosshair className="size-3" />
            Precision @ K
          </CardDescription>
          <CardTitle className="font-display text-3xl font-normal italic">
            The queue&apos;s top {k}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <div className="font-display text-7xl leading-none tabular-nums tracking-tight">
              {(pakValue * 100).toFixed(1)}
              <span className="text-3xl text-muted-foreground">%</span>
            </div>
            <span className="text-xs text-muted-foreground">
              of the top-{k} scores are true anomalies
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-700"
              style={{
                width: `${pakValue * 100}%`,
                background:
                  "linear-gradient(90deg, var(--chart-3), var(--chart-2) 70%, var(--chart-1))",
              }}
            />
            <div
              aria-hidden
              className="absolute inset-y-0 w-px bg-foreground/40"
              style={{ left: "75%" }}
              title="Constitution gate: 0.75"
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>0%</span>
            <span>gate · 75%</span>
            <span>100%</span>
          </div>
        </CardContent>
        <CardFooter className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Operating threshold drives investigator workload ordering
        </CardFooter>
      </Card>
    </div>
  );
}

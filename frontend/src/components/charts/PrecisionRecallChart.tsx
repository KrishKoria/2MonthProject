"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ModelPerformance } from "@/lib/types";

interface Props {
  curve: ModelPerformance["precision_recall_curve"];
  operatingThreshold?: number;
}

function CurveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { precision: number; recall: number; threshold: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border/80 bg-background/95 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      <div className="font-mono uppercase tracking-[0.12em] text-muted-foreground">
        threshold {p.threshold.toFixed(2)}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono tabular-nums">
        <span className="text-muted-foreground">precision</span>
        <span className="text-right">{(p.precision * 100).toFixed(1)}%</span>
        <span className="text-muted-foreground">recall</span>
        <span className="text-right">{(p.recall * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function PrecisionRecallChart({ curve, operatingThreshold = 0.5 }: Props) {
  const data = [...curve].sort((a, b) => a.recall - b.recall);
  const op = curve.find((p) => Math.abs(p.threshold - operatingThreshold) < 1e-6);

  return (
    <Card className="animate-rise relative overflow-hidden" style={{ animationDelay: "220ms" }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.15),transparent)]"
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Precision–recall curve
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              The tradeoff, plotted
            </CardTitle>
          </div>
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px] whitespace-nowrap">
            <span className="inline-block size-1.5 rounded-full bg-[var(--chart-2)]" />
            Synthetic data
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="recall"
                type="number"
                domain={[0, 1]}
                tickCount={6}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                stroke="var(--muted-foreground)"
                tick={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono, ui-monospace)",
                  letterSpacing: "0.08em",
                }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                dataKey="precision"
                type="number"
                domain={[0, 1]}
                tickCount={6}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                stroke="var(--muted-foreground)"
                tick={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono, ui-monospace)",
                  letterSpacing: "0.08em",
                }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                width={40}
              />
              <Tooltip
                content={<CurveTooltip />}
                cursor={{ stroke: "var(--foreground)", strokeDasharray: "2 4", strokeOpacity: 0.4 }}
              />
              <Line
                type="monotone"
                dataKey="precision"
                stroke="var(--foreground)"
                strokeWidth={1.75}
                dot={{ r: 2, fill: "var(--background)", stroke: "var(--foreground)", strokeWidth: 1 }}
                activeDot={{ r: 4, fill: "var(--foreground)", stroke: "var(--background)", strokeWidth: 2 }}
                isAnimationActive
                animationDuration={900}
                animationEasing="ease-out"
              />
              {op ? (
                <ReferenceDot
                  x={op.recall}
                  y={op.precision}
                  r={6}
                  fill="var(--chart-1)"
                  stroke="var(--background)"
                  strokeWidth={2}
                  ifOverflow="visible"
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-px w-5 bg-foreground" />
            Curve
          </span>
          {op ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-[var(--chart-1)]" />
              Operating · τ {op.threshold.toFixed(2)} · P{" "}
              <span className="font-mono">{(op.precision * 100).toFixed(1)}%</span> · R{" "}
              <span className="font-mono">{(op.recall * 100).toFixed(1)}%</span>
            </span>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="text-xs italic text-muted-foreground">
        Raise the threshold to buy precision; spend recall.
      </CardFooter>
    </Card>
  );
}

import { Split } from "lucide-react";

import { HelpTooltip } from "@/components/guidance/HelpTooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ANOMALY_COPY, TERM_COPY } from "@/lib/experience-copy";
import type { AnomalyType, ModelPerformance } from "@/lib/types";

interface Props {
  recall: ModelPerformance["per_anomaly_recall"];
}

const COPY: Record<AnomalyType, { label: string; note: string; accent: string }> = {
  upcoding: {
    label: ANOMALY_COPY.upcoding.label,
    note: ANOMALY_COPY.upcoding.description,
    accent: "var(--chart-1)",
  },
  ncci_violation: {
    label: ANOMALY_COPY.ncci_violation.label,
    note: ANOMALY_COPY.ncci_violation.description,
    accent: "var(--chart-2)",
  },
  duplicate: {
    label: ANOMALY_COPY.duplicate.label,
    note: ANOMALY_COPY.duplicate.description,
    accent: "var(--chart-3)",
  },
};

function RadialArc({ value, accent }: { value: number; accent: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = 32;
  const circ = 2 * Math.PI * radius;
  const offset = circ - circ * clamped;
  return (
    <svg viewBox="0 0 80 80" width="84" height="84" aria-hidden>
      <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 40 40)"
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
      <text
        x="40"
        y="43"
        textAnchor="middle"
        fontSize="14"
        fontFamily="var(--font-display, serif)"
        fontStyle="italic"
        fill="var(--foreground)"
      >
        {(clamped * 100).toFixed(0)}
        <tspan fontSize="8" fill="var(--muted-foreground)" dx="1">
          %
        </tspan>
      </text>
    </svg>
  );
}

export function PerAnomalyRecallCard({ recall }: Props) {
  const keys = Object.keys(COPY) as AnomalyType[];

  return (
    <Card className="animate-rise relative overflow-hidden" style={{ animationDelay: "380ms" }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.15),transparent)]"
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
              <Split className="size-3" />
              Catch rate by problem type
              <HelpTooltip label="Recall">{TERM_COPY.recall}</HelpTooltip>
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              Which issues are easier to catch
            </CardTitle>
          </div>
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px] whitespace-nowrap">
            <span className="inline-block size-1.5 rounded-full bg-[var(--chart-2)]" />
            Synthetic data
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-6 md:grid-cols-3">
          {keys.map((k) => {
            const value = typeof recall[k] === "number" ? recall[k] : 0;
            const meta = COPY[k];
            return (
              <li
                key={k}
                className="flex flex-col items-start gap-3 md:border-l md:border-border/70 md:pl-5 md:first:border-l-0 md:first:pl-0"
              >
                <RadialArc value={value} accent={meta.accent} />
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {meta.label}
                  </span>
                  <p className="max-w-[22ch] text-xs leading-relaxed text-muted-foreground">
                    {meta.note}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="text-xs italic text-muted-foreground">
        Different claim problems leave different signal strength, so the catch
        rate is not uniform.
      </CardFooter>
    </Card>
  );
}

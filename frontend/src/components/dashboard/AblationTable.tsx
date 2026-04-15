import { Layers } from "lucide-react";

import { HelpTooltip } from "@/components/guidance/HelpTooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TERM_COPY } from "@/lib/experience-copy";
import type { ModelPerformance } from "@/lib/types";

interface Props {
  ablation: ModelPerformance["ablation"];
}

type Row = {
  key: "rules_only" | "xgboost_only" | "combined";
  label: string;
  eyebrow: string;
  accent: string;
  highlight?: boolean;
};

const ROWS: Row[] = [
  {
    key: "rules_only",
    label: "Rules baseline",
    eyebrow: "Deterministic",
    accent: "var(--chart-5)",
  },
  {
    key: "xgboost_only",
    label: "XGBoost only",
    eyebrow: "Learned",
    accent: "var(--chart-2)",
  },
  {
    key: "combined",
    label: "Combined",
    eyebrow: "Rules ∪ ML",
    accent: "var(--chart-1)",
    highlight: true,
  },
];

function Bar({ value, accent }: { value: number; accent: string }) {
  return (
    <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-muted">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-700"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: accent }}
      />
    </div>
  );
}

export function AblationTable({ ablation }: Props) {
  const safe = (k: Row["key"]) => ablation[k] ?? { precision: 0, recall: 0, f1: 0 };

  return (
    <Card className="animate-rise relative overflow-hidden" style={{ animationDelay: "300ms" }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.15),transparent)]"
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
              <Layers className="size-3" />
              Combined vs separate checks
              <HelpTooltip label="Why compare the layers">{TERM_COPY.ablation}</HelpTooltip>
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              What each layer contributes
            </CardTitle>
          </div>
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px] whitespace-nowrap">
            <span className="inline-block size-1.5 rounded-full bg-[var(--chart-2)]" />
            Synthetic data
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Column headers */}
        <div className="hidden items-center border-b border-border/70 pb-3 md:grid md:grid-cols-[1.5fr_0.9fr_0.9fr_0.9fr] md:gap-6">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Configuration
          </span>
          {(["Precision", "Recall", "F1"] as const).map((h) => (
            <span
              key={h}
              className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            >
              {h}
            </span>
          ))}
        </div>

        <ul className="flex flex-col divide-y divide-border/70">
          {ROWS.map((row) => {
            const m = safe(row.key);
            return (
              <li
                key={row.key}
                className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 md:grid-cols-[1.5fr_0.9fr_0.9fr_0.9fr] md:items-center md:gap-6"
              >
                <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {row.eyebrow}
                  </span>
                  <span
                    className={`font-display text-xl ${
                      row.highlight ? "italic" : "font-normal"
                    }`}
                    style={{ color: row.highlight ? "var(--foreground)" : undefined }}
                  >
                    {row.label}
                  </span>
                </div>

                <Metric value={m.precision} accent={row.accent} />
                <Metric value={m.recall} accent={row.accent} />
                <Metric value={m.f1} accent={row.accent} emphasis={row.highlight} />
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="text-xs italic text-muted-foreground">
        The combined approach catches more of the right claims without giving up
        much accuracy.
      </CardFooter>
    </Card>
  );
}

function Metric({
  value,
  accent,
  emphasis,
}: {
  value: number;
  accent: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`text-right font-display tabular-nums ${
          emphasis ? "text-2xl" : "text-xl text-muted-foreground"
        }`}
      >
        {(value * 100).toFixed(1)}
        <span className="text-xs">%</span>
      </span>
      <Bar value={value} accent={accent} />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

import { Separator } from "@/components/ui/separator";
import type { RiskBand, RiskScore } from "@/lib/types";

interface RiskPanelProps {
  riskScore: RiskScore | null;
  riskBand: RiskBand | null;
}

const bandColor: Record<RiskBand, string> = {
  high: "var(--chart-1)",
  medium: "var(--chart-2)",
  low: "var(--chart-3)",
};

export function RiskPanel({ riskScore, riskBand }: RiskPanelProps) {
  const score = riskScore?.xgboost_score ?? null;
  const pctScore = score != null ? score * 100 : null;
  const color = riskBand ? bandColor[riskBand] : "var(--muted-foreground)";

  const topShap = useMemo(
    () =>
      riskScore
        ? Object.entries(riskScore.shap_values)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 6)
        : [],
    [riskScore],
  );
  const shapMax = Math.max(...topShap.map(([, v]) => Math.abs(v)), 0.0001);

  const dash = 2 * Math.PI * 42;
  const progress = pctScore != null ? (pctScore / 100) * dash : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        <div className="relative size-[104px] shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="6"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={dash}
              initial={{ strokeDashoffset: dash }}
              animate={{ strokeDashoffset: dash - progress }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl tabular-nums">
              {pctScore != null ? pctScore.toFixed(0) : "—"}
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              of 100
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Risk band
          </span>
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full animate-soft-pulse"
              style={{ background: color }}
            />
            <span className="font-display text-2xl italic capitalize">
              {riskBand ?? "unscored"}
            </span>
          </div>
          {riskScore?.rules_flags.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {riskScore.rules_flags.map((f) => (
                <span
                  key={f}
                  className="rounded-sm border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Separator />

      <div>
        <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Top contributing features
        </div>
        {topShap.length === 0 ? (
          <p className="text-xs text-muted-foreground">No SHAP attribution available.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {topShap.map(([feat, val], i) => {
              const pct = (Math.abs(val) / shapMax) * 100;
              const positive = val >= 0;
              const tone = positive ? "var(--chart-1)" : "var(--chart-3)";
              return (
                <li key={feat} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-mono">{feat}</span>
                    <span
                      className="font-mono tabular-nums"
                      style={{ color: tone }}
                    >
                      {positive ? "+" : ""}
                      {val.toFixed(3)}
                    </span>
                  </div>
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full"
                      style={{ background: tone }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{
                        duration: 0.7,
                        delay: 0.1 + i * 0.06,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

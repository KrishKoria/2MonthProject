"use client";

import { motion } from "motion/react";
import { AlertOctagon, BookMarked, Sparkles, StickyNote } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type { RationaleResult, SourceRecord } from "@/lib/types";

interface RationaleStreamProps {
  streaming: boolean;
  streamText: string;
  rationale: RationaleResult | null;
  halted?: { reason: string; sources: SourceRecord[] } | null;
  error?: string | null;
}

export function RationaleStream({
  streaming,
  streamText,
  rationale,
  halted,
  error,
}: RationaleStreamProps) {
  if (halted) {
    return (
      <Alert variant="destructive" className="border-dashed">
        <AlertOctagon />
        <AlertTitle className="font-display text-lg italic">
          Manual review required
        </AlertTitle>
        <AlertDescription>
          Insufficient evidence to synthesize a rationale — all four evidence
          sources were unavailable or returned no signal. Route this claim to a
          senior investigator.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertOctagon />
        <AlertTitle>Rationale failed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Streaming — show progressive text with typewriter caret.
  if (streaming && !rationale) {
    const visible = extractSummaryPreview(streamText);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="size-3 animate-soft-pulse" style={{ color: "var(--chart-2)" }} />
          Synthesizing rationale…
        </div>
        <motion.blockquote
          className="font-display text-2xl italic leading-snug text-foreground/90 md:text-3xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {visible || <span className="text-muted-foreground">Reading evidence…</span>}
          <span
            aria-hidden
            className="ml-1 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-foreground/70 animate-soft-pulse"
          />
        </motion.blockquote>
      </div>
    );
  }

  if (!rationale) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6"
    >
      <blockquote className="relative font-display text-2xl italic leading-snug text-foreground md:text-3xl">
        <span
          aria-hidden
          className="absolute -left-4 -top-2 font-display text-5xl leading-none text-accent/60"
        >
          &ldquo;
        </span>
        {rationale.summary}
      </blockquote>

      <Separator />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Eyebrow>Recommended action</Eyebrow>
          <p className="text-sm leading-relaxed">{rationale.recommended_action}</p>
          {rationale.review_needed ? (
            <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--chart-2)]">
              · Human review advised
            </p>
          ) : null}
        </div>
        <div>
          <Eyebrow>Confidence</Eyebrow>
          <div className="flex items-baseline gap-1">
            <span className="font-display text-4xl tabular-nums">
              {(rationale.confidence * 100).toFixed(0)}
            </span>
            <span className="text-base text-muted-foreground">%</span>
          </div>
          <ConfidenceBar value={rationale.confidence} />
        </div>
      </div>

      {rationale.supporting_evidence.length > 0 ? (
        <section>
          <Eyebrow icon={StickyNote}>Supporting evidence</Eyebrow>
          <ul className="flex flex-col gap-2 text-sm">
            {rationale.supporting_evidence.map((e, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="mt-[0.55em] inline-block size-1 shrink-0 rounded-full bg-foreground/60" />
                {e}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {Object.keys(rationale.anomaly_flags_addressed).length > 0 ? (
        <section>
          <Eyebrow>Anomaly flags addressed</Eyebrow>
          <dl className="grid gap-2 md:grid-cols-3">
            {Object.entries(rationale.anomaly_flags_addressed).map(([flag, note]) => (
              <div
                key={flag}
                className="rounded-md border border-border/70 bg-background px-3 py-2"
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {flag.replace(/_/g, " ")}
                </dt>
                <dd className="mt-1 text-xs leading-relaxed">
                  {note ?? (
                    <span className="text-muted-foreground italic">not applicable</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {rationale.policy_citations.length > 0 ? (
        <section>
          <Eyebrow icon={BookMarked}>Cited in rationale</Eyebrow>
          <ul className="flex flex-col gap-3">
            {rationale.policy_citations.map((c, i) => (
              <li
                key={i}
                className="border-l-2 border-accent/80 bg-accent/5 py-2 pl-4 pr-3 text-sm"
              >
                <p className="italic">&ldquo;{c.text}&rdquo;</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {c.source}
                  {c.chapter ? ` · ch. ${c.chapter}` : ""}
                  {c.section ? ` · § ${c.section}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </motion.div>
  );
}

function Eyebrow({
  icon: Icon,
  children,
}: {
  icon?: typeof BookMarked;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full"
        style={{ background: "var(--foreground)" }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/**
 * The LLM streams JSON-shaped tokens; before the final parse we want to show
 * the `summary` field as it arrives. Best-effort regex — we never display raw
 * JSON braces or keys to the investigator.
 */
function extractSummaryPreview(buffer: string): string {
  if (!buffer) return "";
  const match = buffer.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return "";
  return match[1]
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

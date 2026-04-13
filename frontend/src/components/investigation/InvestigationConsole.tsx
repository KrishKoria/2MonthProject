"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { streamInvestigation } from "@/lib/sse";
import type {
  AnomalyFlagValue,
  EvidenceEnvelope,
  Investigation,
  RationaleResult,
  SourceRecord,
  TriageResult,
} from "@/lib/types";

import { EvidenceCards } from "./EvidenceCards";
import { RationaleStream } from "./RationaleStream";

type Stage = "idle" | "triage" | "evidence" | "rationale" | "done" | "halted" | "error";

interface InvestigationConsoleProps {
  claimId: string;
  initial: Investigation | null;
}

const STAGES: Array<{ key: Exclude<Stage, "idle" | "error" | "halted">; label: string }> = [
  { key: "triage", label: "Triage" },
  { key: "evidence", label: "Evidence" },
  { key: "rationale", label: "Rationale" },
  { key: "done", label: "Sealed" },
];

const FLAG_TONE: Record<AnomalyFlagValue, { bg: string; fg: string; label: string }> = {
  detected: { bg: "color-mix(in oklch, var(--chart-1) 14%, transparent)", fg: "var(--chart-1)", label: "Detected" },
  not_applicable: { bg: "var(--muted)", fg: "var(--muted-foreground)", label: "N/A" },
  insufficient_data: { bg: "color-mix(in oklch, var(--chart-2) 18%, transparent)", fg: "var(--chart-2)", label: "Insufficient" },
};

const ANOMALY_ORDER: Array<keyof TriageResult["anomaly_flags"]> = [
  "upcoding",
  "ncci_violation",
  "duplicate",
];

export function InvestigationConsole({ claimId, initial }: InvestigationConsoleProps) {
  const [triage, setTriage] = useState<TriageResult | null>(initial?.triage ?? null);
  const [evidence, setEvidence] = useState<EvidenceEnvelope | null>(initial?.evidence ?? null);
  const [rationale, setRationale] = useState<RationaleResult | null>(initial?.rationale ?? null);
  const [streamText, setStreamText] = useState("");
  const [stage, setStage] = useState<Stage>(() => inferStage(initial));
  const [halted, setHalted] = useState<{ reason: string; sources: SourceRecord[] } | null>(
    initial?.investigation_status === "manual_review_required"
      ? {
          reason: "insufficient_evidence",
          sources: initial.evidence?.sources_consulted ?? [],
        }
      : null,
  );
  const [error, setError] = useState<string | null>(
    initial?.investigation_status === "error" ? "Investigation previously failed." : null,
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (stage === "triage" || stage === "evidence" || stage === "rationale") {
      const id = window.setInterval(() => {
        if (startedRef.current != null) {
          setElapsedMs(performance.now() - startedRef.current);
        }
      }, 100);
      return () => window.clearInterval(id);
    }
  }, [stage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const running = stage === "triage" || stage === "evidence" || stage === "rationale";
  const hasResults = triage || evidence || rationale || halted || error;

  function reset() {
    setTriage(null);
    setEvidence(null);
    setRationale(null);
    setStreamText("");
    setHalted(null);
    setError(null);
    setElapsedMs(0);
  }

  function start() {
    abortRef.current?.abort();
    reset();
    setStage("triage");
    startedRef.current = performance.now();

    abortRef.current = streamInvestigation(claimId, {
      onTriage: (e) => {
        setTriage(e.data);
        setStage("evidence");
      },
      onEvidence: (e) => {
        setEvidence(e.data);
        setStage("rationale");
      },
      onRationaleChunk: (e) => {
        setStreamText((prev) => prev + e.data.text);
      },
      onComplete: (e) => {
        const inv = e.data;
        if (inv.rationale) setRationale(inv.rationale);
        setStage("done");
        toast.success("Investigation complete", {
          description: "Rationale sealed and persisted.",
        });
      },
      onHalt: (e) => {
        setHalted({
          reason: e.data.reason,
          sources: e.data.sources_consulted,
        });
        setStage("halted");
        toast.warning("Manual review required", {
          description: "Evidence insufficient — routed for human review.",
        });
      },
      onError: (e) => {
        setError(e.data.message);
        setStage("error");
        toast.error("Investigation failed", { description: e.data.message });
      },
      onNetworkError: (err) => {
        const message = err instanceof Error ? err.message : "Network error";
        setError(message);
        setStage("error");
        toast.error("Connection lost", { description: message });
      },
    });
  }

  function cancel() {
    abortRef.current?.abort();
    setStage("idle");
    startedRef.current = null;
    toast.message("Investigation cancelled");
  }

  return (
    <div className="flex flex-col gap-6">
      <Header
        stage={stage}
        running={running}
        hasResults={!!hasResults}
        elapsedMs={elapsedMs}
        onStart={start}
        onCancel={cancel}
      />

      <Timeline stage={stage} />

      {!hasResults && !running ? (
        <Empty className="border border-dashed border-border/70 rounded-lg">
          <EmptyHeader>
            <EmptyTitle className="font-display italic text-2xl">
              No investigation on file
            </EmptyTitle>
            <EmptyDescription>
              Press <em>Investigate</em> to stream triage, evidence, and the
              AI-synthesized rationale into the record.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <AnimatePresence>
        {triage ? (
          <motion.section
            key="triage"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <TriagePanel triage={triage} />
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {evidence ? (
          <motion.section
            key="evidence"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Separator className="mb-6" />
            <SectionEyebrow>Evidence envelope</SectionEyebrow>
            <EvidenceCards evidence={evidence} />
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {(rationale || stage === "rationale" || halted || error) ? (
          <motion.section
            key="rationale"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Separator className="mb-6" />
            <SectionEyebrow>Rationale</SectionEyebrow>
            <RationaleStream
              streaming={stage === "rationale"}
              streamText={streamText}
              rationale={rationale}
              halted={halted}
              error={error}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Header({
  stage,
  running,
  hasResults,
  elapsedMs,
  onStart,
  onCancel,
}: {
  stage: Stage;
  running: boolean;
  hasResults: boolean;
  elapsedMs: number;
  onStart: () => void;
  onCancel: () => void;
}) {
  const label =
    stage === "done"
      ? "Sealed"
      : stage === "halted"
      ? "Manual review"
      : stage === "error"
      ? "Error"
      : running
      ? "Investigating"
      : hasResults
      ? "On file"
      : "Not started";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="gap-1.5 text-[10px] uppercase tracking-[0.14em]"
        >
          {running ? (
            <Loader2 className="size-3 animate-spin" />
          ) : stage === "done" ? (
            <CheckCircle2 className="size-3" style={{ color: "var(--chart-3)" }} />
          ) : (
            <CircleDashed className="size-3" />
          )}
          {label}
        </Badge>
        {running ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {running ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={onStart}
          disabled={running}
          className="group"
        >
          {hasResults && !running ? (
            <>
              <RotateCcw data-icon="inline-start" />
              Re-investigate
            </>
          ) : running ? (
            <>
              <Sparkles data-icon="inline-start" className="animate-soft-pulse" />
              Streaming…
            </>
          ) : (
            <>
              <ShieldCheck data-icon="inline-start" />
              Investigate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Timeline({ stage }: { stage: Stage }) {
  const stageIndex = useMemo(() => {
    if (stage === "idle") return -1;
    if (stage === "halted" || stage === "error") return 1; // through evidence
    const idx = STAGES.findIndex((s) => s.key === stage);
    return idx === -1 ? STAGES.length - 1 : idx;
  }, [stage]);

  return (
    <div
      aria-label="Investigation timeline"
      className="relative grid grid-cols-4 gap-0"
    >
      <div
        aria-hidden
        className="absolute inset-x-4 top-3 h-px bg-border"
      />
      <motion.div
        aria-hidden
        className="absolute left-4 top-3 h-px origin-left bg-foreground/80"
        initial={false}
        animate={{
          scaleX:
            stageIndex < 0
              ? 0
              : stageIndex >= STAGES.length - 1
              ? 1
              : (stageIndex + (stage === "error" || stage === "halted" ? 0 : 0.4)) /
                (STAGES.length - 1),
        }}
        style={{ right: "1rem" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
      {STAGES.map((s, i) => {
        const active = i <= stageIndex;
        const current = i === stageIndex && (stage === "triage" || stage === "evidence" || stage === "rationale");
        return (
          <div key={s.key} className="relative flex flex-col items-center gap-2">
            <div
              className="relative z-10 flex size-6 items-center justify-center rounded-full border bg-background transition-colors"
              style={{
                borderColor: active ? "var(--foreground)" : "var(--border)",
                background: active ? "var(--foreground)" : "var(--background)",
              }}
            >
              {current ? (
                <span className="size-1.5 rounded-full bg-background animate-soft-pulse" />
              ) : active ? (
                <CheckCircle2 className="size-3 text-background" />
              ) : (
                <span className="size-1 rounded-full bg-muted-foreground/60" />
              )}
            </div>
            <span
              className="text-[10px] uppercase tracking-[0.14em]"
              style={{
                color: active ? "var(--foreground)" : "var(--muted-foreground)",
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TriagePanel({ triage }: { triage: TriageResult }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionEyebrow>Triage read</SectionEyebrow>
      <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Priority
          </span>
          <span
            className="font-display text-3xl italic capitalize"
            style={{
              color:
                triage.priority === "high"
                  ? "var(--chart-1)"
                  : triage.priority === "medium"
                  ? "var(--chart-2)"
                  : "var(--chart-3)",
            }}
          >
            {triage.priority}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            conf {(triage.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {ANOMALY_ORDER.map((flag) => {
            const value = triage.anomaly_flags[flag] ?? "not_applicable";
            const tone = FLAG_TONE[value];
            return (
              <div
                key={flag}
                className="rounded-md border border-border/70 bg-background px-3 py-2.5"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {flag.replace(/_/g, " ")}
                </div>
                <div
                  className="mt-1.5 inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {tone.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function inferStage(inv: Investigation | null): Stage {
  if (!inv) return "idle";
  switch (inv.investigation_status) {
    case "complete":
      return "done";
    case "manual_review_required":
      return "halted";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

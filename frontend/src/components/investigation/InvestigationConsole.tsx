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
import { ANOMALY_COPY } from "@/lib/experience-copy";
import {
  getDisplayedAnomalyFlagStatus,
  inferInvestigationStage,
  type DisplayedAnomalyFlagStatus,
  type InvestigationStage,
} from "@/lib/investigation";
import { streamInvestigation } from "@/lib/sse";
import { cn } from "@/lib/utils";
import type {
  EvidenceEnvelope,
  HumanDecision,
  Investigation,
  RationaleResult,
  SourceRecord,
  TriageResult,
} from "@/lib/types";

import { EvidenceCards } from "./EvidenceCards";
import { HumanReviewDesk } from "./HumanReviewDesk";
import { RationaleStream } from "./RationaleStream";

interface InvestigationConsoleProps {
  claimId: string;
  initial: Investigation | null;
}

const STAGES: Array<{ key: Exclude<InvestigationStage, "idle" | "error" | "halted">; label: string }> = [
  { key: "triage", label: "Quick scan" },
  { key: "evidence", label: "Check facts" },
  { key: "rationale", label: "Draft summary" },
  { key: "done", label: "Ready" },
];

const FLAG_TONE: Record<DisplayedAnomalyFlagStatus, { bg: string; fg: string; label: string }> = {
  detected: { bg: "color-mix(in oklch, var(--chart-1) 14%, transparent)", fg: "var(--chart-1)", label: "Detected" },
  clear: { bg: "color-mix(in oklch, var(--chart-3) 16%, transparent)", fg: "var(--chart-3)", label: "Clear" },
  not_applicable: { bg: "var(--muted)", fg: "var(--muted-foreground)", label: "N/A" },
  insufficient_data: { bg: "color-mix(in oklch, var(--chart-2) 18%, transparent)", fg: "var(--chart-2)", label: "Insufficient" },
  unavailable: { bg: "color-mix(in oklch, var(--chart-2) 12%, transparent)", fg: "var(--chart-2)", label: "Unavailable" },
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
  const [humanDecision, setHumanDecision] = useState<HumanDecision | null>(
    initial?.human_decision ?? null,
  );
  const [streamText, setStreamText] = useState("");
  const [stage, setStage] = useState<InvestigationStage>(() =>
    inferInvestigationStage(initial),
  );
  const [isStreaming, setIsStreaming] = useState(false);
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
    if (isStreaming) {
      const id = window.setInterval(() => {
        if (startedRef.current != null) {
          setElapsedMs(performance.now() - startedRef.current);
        }
      }, 100);
      return () => window.clearInterval(id);
    }
  }, [isStreaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const inProgress = stage === "triage" || stage === "evidence" || stage === "rationale";
  const hasResults =
    stage !== "idle" || triage || evidence || rationale || halted || humanDecision || error;

  function applyInvestigationSnapshot(investigation: Investigation) {
    setTriage(investigation.triage);
    setEvidence(investigation.evidence);
    setRationale(investigation.rationale);
    setHumanDecision(investigation.human_decision);
    setStage(inferInvestigationStage(investigation));
    setHalted(
      investigation.investigation_status === "manual_review_required"
        ? {
            reason: "manual_review_required",
            sources: investigation.evidence?.sources_consulted ?? [],
          }
        : null,
    );
    setError(
      investigation.investigation_status === "error"
        ? "Investigation failed while writing the final record."
        : null,
    );
  }

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
    setIsStreaming(true);
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
        applyInvestigationSnapshot(e.data);
        toast.success("Investigation complete", {
          description: "The draft summary is ready for your decision.",
        });
      },
      onHalt: (e) => {
        setHalted({
          reason: e.data.reason,
          sources: e.data.sources_consulted,
        });
        setStage("halted");
        toast.warning("Manual review required", {
          description: "There was not enough signal to write a trustworthy summary.",
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
      onClose: () => {
        setIsStreaming(false);
        startedRef.current = null;
      },
    });
  }

  function cancel() {
    abortRef.current?.abort();
    setIsStreaming(false);
    startedRef.current = null;
    toast.message("Investigation cancelled");
  }

  return (
    <div className="flex flex-col gap-6">
      <Header
        stage={stage}
        isStreaming={isStreaming}
        inProgress={inProgress}
        hasResults={!!hasResults}
        elapsedMs={elapsedMs}
        onStart={start}
        onCancel={cancel}
      />

      <Timeline stage={stage} isStreaming={isStreaming} />

      {!hasResults ? (
        <Empty className="border border-dashed border-border/70 rounded-lg">
          <EmptyHeader>
            <EmptyTitle className="font-display italic text-2xl">
              No case review has started yet
            </EmptyTitle>
            <EmptyDescription>
              Start guided review to build a quick scan, supporting facts, and a
              draft summary before you decide what happens next.
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
            <TriagePanel triage={triage} evidence={evidence} />
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
            <SectionEyebrow>Supporting facts</SectionEyebrow>
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
            <SectionEyebrow>Draft summary</SectionEyebrow>
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

      <AnimatePresence>
        {(rationale || halted || humanDecision) && !error ? (
          <motion.section
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Separator className="mb-6" />
            <SectionEyebrow>Your decision</SectionEyebrow>
            <HumanReviewDesk
              claimId={claimId}
              humanDecision={humanDecision}
              disabled={isStreaming}
              onDecisionSaved={applyInvestigationSnapshot}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Header({
  stage,
  isStreaming,
  inProgress,
  hasResults,
  elapsedMs,
  onStart,
  onCancel,
}: {
  stage: InvestigationStage;
  isStreaming: boolean;
  inProgress: boolean;
  hasResults: boolean;
  elapsedMs: number;
  onStart: () => void;
  onCancel: () => void;
}) {
  const label =
    stage === "done"
      ? "Sealed"
      : stage === "halted"
      ? "Needs a person"
      : stage === "error"
      ? "Could not finish"
      : isStreaming
      ? "Building your case"
      : inProgress
      ? "In progress"
      : hasResults
      ? "Ready for review"
      : "Not started";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="gap-1.5 text-[10px] uppercase tracking-[0.14em]"
        >
          {isStreaming ? (
            <Loader2 className="size-3 animate-spin" />
          ) : stage === "done" ? (
            <CheckCircle2 className="size-3" style={{ color: "var(--chart-3)" }} />
          ) : inProgress ? (
            <Sparkles className="size-3" style={{ color: "var(--chart-2)" }} />
          ) : (
            <CircleDashed className="size-3" />
          )}
          {label}
        </Badge>
        {isStreaming ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {isStreaming ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={onStart}
          disabled={isStreaming}
          className="group"
        >
          {hasResults && !isStreaming ? (
            <>
              <RotateCcw data-icon="inline-start" />
              Run guided review again
            </>
          ) : isStreaming ? (
            <>
              <Sparkles data-icon="inline-start" className="animate-soft-pulse" />
              Working…
            </>
          ) : (
            <>
              <ShieldCheck data-icon="inline-start" />
              Start guided review
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Timeline({
  stage,
  isStreaming,
}: {
  stage: InvestigationStage;
  isStreaming: boolean;
}) {
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
        const current =
          i === stageIndex && (stage === "triage" || stage === "evidence" || stage === "rationale");
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
                <span
                  className={cn(
                    "size-1.5 rounded-full bg-background",
                    isStreaming && "animate-soft-pulse",
                  )}
                />
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

function TriagePanel({
  triage,
  evidence,
}: {
  triage: TriageResult;
  evidence: EvidenceEnvelope | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionEyebrow>{evidence ? "What stands out" : "Quick scan"}</SectionEyebrow>
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
            confidence {(triage.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {ANOMALY_ORDER.map((flag) => {
            const value = getDisplayedAnomalyFlagStatus(flag, triage.anomaly_flags, evidence);
            const tone = FLAG_TONE[value];
            return (
              <div
                key={flag}
                className="rounded-md border border-border/70 bg-background px-3 py-2.5"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {ANOMALY_COPY[flag].label}
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

"use client";

import { motion } from "motion/react";
import { BookMarked, CircleCheck, CircleDashed, FileSearch, Scale, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { EvidenceEnvelope, EvidenceTool, SourceRecord } from "@/lib/types";

interface EvidenceCardsProps {
  evidence: EvidenceEnvelope | null;
}

const TOOL_META: Record<
  EvidenceTool,
  { label: string; icon: typeof BookMarked }
> = {
  rag_retrieval: { label: "Policy RAG", icon: BookMarked },
  ncci_lookup: { label: "NCCI edits", icon: Scale },
  provider_history: { label: "Provider history", icon: Users },
  duplicate_search: { label: "Duplicate search", icon: FileSearch },
};

function SourcesStrip({ sources }: { sources: SourceRecord[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((s) => {
        const meta = TOOL_META[s.tool];
        const Icon = meta?.icon ?? CircleDashed;
        const ok = s.status === "success";
        return (
          <HoverCard key={s.tool} openDelay={120}>
            <HoverCardTrigger asChild>
              <span
                className="inline-flex items-center gap-1.5 rounded-sm border border-border/70 bg-background px-2 py-1 text-[10px] uppercase tracking-[0.12em] cursor-help"
                style={{ color: ok ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {ok ? (
                  <CircleCheck className="size-3" style={{ color: "var(--chart-3)" }} />
                ) : (
                  <CircleDashed className="size-3" />
                )}
                <Icon className="size-3" />
                {meta?.label ?? s.tool}
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-64 text-xs">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.tool}
              </div>
              <div className="mt-1 text-sm">
                {ok ? "Consulted successfully." : "Unavailable."}
              </div>
              {s.reason ? (
                <p className="mt-2 text-muted-foreground italic">{s.reason}</p>
              ) : null}
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}

export function EvidenceCards({ evidence }: EvidenceCardsProps) {
  if (!evidence) return null;
  const { policy_citations, ncci_findings, provider_context, duplicate_matches, sources_consulted } =
    evidence;

  const blocks: Array<{ key: string; node: React.ReactNode }> = [];

  if (policy_citations.length) {
    blocks.push({
      key: "policy",
      node: (
        <section>
          <Eyebrow icon={BookMarked}>Policy citations</Eyebrow>
          <ul className="flex flex-col gap-3">
            {policy_citations.map((c, i) => (
              <li
                key={i}
                className="border-l-2 border-accent/80 bg-accent/5 py-2.5 pl-4 pr-3 text-sm"
              >
                <p className="italic leading-relaxed">&ldquo;{c.text}&rdquo;</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{c.source}</span>
                  {c.chapter ? <span>· ch. {c.chapter}</span> : null}
                  {c.section ? <span>· § {c.section}</span> : null}
                  <span className="ml-auto tabular-nums">
                    relevance {(c.relevance_score * 100).toFixed(0)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ),
    });
  }

  if (ncci_findings) {
    blocks.push({
      key: "ncci",
      node: (
        <section>
          <Eyebrow icon={Scale}>NCCI edit check</Eyebrow>
          <div className="rounded-md border border-border bg-background px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge
                variant={ncci_findings.conflict_exists ? "destructive" : "secondary"}
                className="text-[10px] uppercase tracking-wider"
              >
                {ncci_findings.conflict_exists ? "Conflict" : "Clear"}
              </Badge>
              {ncci_findings.edit_type ? (
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {ncci_findings.edit_type}
                </span>
              ) : null}
              {ncci_findings.effective_date ? (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  eff. {ncci_findings.effective_date}
                </span>
              ) : null}
            </div>
            {ncci_findings.rationale ? (
              <p className="mt-2 text-muted-foreground">{ncci_findings.rationale}</p>
            ) : null}
          </div>
        </section>
      ),
    });
  }

  if (provider_context) {
    blocks.push({
      key: "provider",
      node: (
        <section>
          <Eyebrow icon={Users}>Provider context</Eyebrow>
          <p className="text-sm leading-relaxed text-foreground/90">{provider_context}</p>
        </section>
      ),
    });
  }

  if (duplicate_matches.length) {
    blocks.push({
      key: "dupes",
      node: (
        <section>
          <Eyebrow icon={FileSearch}>Possible duplicates</Eyebrow>
          <ul className="flex flex-col gap-2">
            {duplicate_matches.map((d) => (
              <li
                key={d.claim_id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs">{d.claim_id}</span>
                <span className="text-xs text-muted-foreground">{d.service_date}</span>
                <div className="flex flex-wrap gap-1">
                  {d.procedure_codes.map((c) => (
                    <span key={c} className="font-mono text-[10px] text-muted-foreground">
                      {c}
                    </span>
                  ))}
                </div>
                <span
                  className="ml-auto font-mono text-xs tabular-nums"
                  style={{ color: "var(--chart-2)" }}
                >
                  {(d.similarity_score * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SourcesStrip sources={sources_consulted} />
      {blocks.length ? <Separator /> : null}
      <div className="flex flex-col gap-6">
        {blocks.map((b, i) => (
          <motion.div
            key={b.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
          >
            {b.node}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Eyebrow({
  icon: Icon,
  children,
}: {
  icon: typeof BookMarked;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      <Icon className="size-3" />
      {children}
    </div>
  );
}

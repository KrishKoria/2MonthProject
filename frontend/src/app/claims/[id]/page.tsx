import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, CircleAlert, FileSearch, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { ApiError, api } from "@/lib/api";
import type { ClaimDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ClaimDetailPage({ params }: PageProps) {
  const { id } = await params;
  let detail: ClaimDetail | null = null;
  let error: string | null = null;
  try {
    detail = await api.getClaim(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    error = e instanceof Error ? e.message : "Failed to load claim";
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not load claim</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!detail) return null;
  const { claim, risk_score, investigation } = detail;
  const riskScoreNum = risk_score?.xgboost_score;
  const riskBand = risk_score?.risk_band;
  const riskColor =
    riskBand === "high"
      ? "var(--chart-1)"
      : riskBand === "medium"
      ? "var(--chart-2)"
      : "var(--chart-3)";

  const topShap = risk_score
    ? Object.entries(risk_score.shap_values)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 6)
    : [];
  const shapMax = Math.max(...topShap.map(([, v]) => Math.abs(v)), 0.0001);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-8 pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/claims" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3" />
          All claims
        </Link>
        <ChevronRight className="size-3" />
        <span className="font-mono">{claim.claim_id}</span>
      </nav>

      {/* Header */}
      <header className="animate-rise mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <FileSearch className="size-3" />
            Claim dossier
          </div>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight md:text-6xl">
            Case <em className="text-muted-foreground">№</em>{" "}
            <span className="font-mono text-3xl md:text-4xl">{claim.claim_id}</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Received {claim.claim_receipt_date}</span>
            <span>·</span>
            <span>Service {claim.service_date}</span>
            <span>·</span>
            <span className="font-mono">POS {claim.place_of_service}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            {claim.claim_status.replace(/_/g, " ")}
          </Badge>
          {claim.anomaly_type ? (
            <Badge className="text-[10px] uppercase tracking-wider" style={{ background: riskColor }}>
              {claim.anomaly_type.replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {/* Risk panel */}
        <Card className="animate-rise lg:col-span-1" style={{ animationDelay: "80ms" }}>
          <CardHeader>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Risk score
            </CardDescription>
            <CardTitle className="font-display text-6xl font-normal tabular-nums">
              {riskScoreNum != null ? (
                (riskScoreNum * 100).toFixed(0)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: riskColor }}
              />
              <span className="text-sm capitalize">{riskBand ?? "unscored"} risk band</span>
            </div>
            <Separator />
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Top contributing features
              </div>
              {topShap.length === 0 ? (
                <p className="text-xs text-muted-foreground">No SHAP attribution available.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {topShap.map(([feat, val]) => {
                    const pct = (Math.abs(val) / shapMax) * 100;
                    const positive = val >= 0;
                    return (
                      <li key={feat} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="font-mono">{feat}</span>
                          <span
                            className="font-mono tabular-nums"
                            style={{ color: positive ? "var(--chart-1)" : "var(--chart-3)" }}
                          >
                            {positive ? "+" : ""}
                            {val.toFixed(3)}
                          </span>
                        </div>
                        <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              background: positive ? "var(--chart-1)" : "var(--chart-3)",
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Claim facts */}
        <Card className="animate-rise lg:col-span-2" style={{ animationDelay: "150ms" }}>
          <CardHeader>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Claim record
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              What the ledger shows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <Fact label="Member" value={claim.member_id} mono />
              <Fact label="Provider" value={claim.provider_id} mono />
              <Fact label="Charge" value={`$${claim.charge_amount.toFixed(2)}`} />
              <Fact label="Allowed" value={`$${claim.allowed_amount.toFixed(2)}`} />
              <Fact label="Paid" value={`$${claim.paid_amount.toFixed(2)}`} />
              <Fact label="Place of service" value={claim.place_of_service} mono />
              <Fact
                label="Procedure codes"
                value={
                  <div className="flex flex-wrap gap-1">
                    {claim.procedure_codes.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-[10px]">
                        {c}
                      </Badge>
                    ))}
                  </div>
                }
              />
              <Fact
                label="Diagnosis codes"
                value={
                  <div className="flex flex-wrap gap-1">
                    {claim.diagnosis_codes.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-[10px]">
                        {c}
                      </Badge>
                    ))}
                  </div>
                }
              />
              {claim.modifiers.length > 0 ? (
                <Fact
                  label="Modifiers"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {claim.modifiers.map((m) => (
                        <Badge key={m} variant="secondary" className="font-mono text-[10px]">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  }
                />
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Investigation */}
      <Card className="mt-5 animate-rise" style={{ animationDelay: "220ms" }}>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
                Investigation
              </CardDescription>
              <CardTitle className="font-display text-3xl font-normal italic">
                Evidence &amp; rationale
              </CardTitle>
            </div>
            {investigation ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {investigation.investigation_status.replace(/_/g, " ")}
              </Badge>
            ) : (
              <Button size="sm" disabled>
                <ShieldCheck data-icon="inline-start" />
                Investigate
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {investigation?.rationale ? (
            <div className="flex flex-col gap-6">
              <blockquote className="font-display text-2xl italic leading-snug text-foreground">
                “{investigation.rationale.summary}”
              </blockquote>
              <Separator />
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Recommended action
                  </h3>
                  <p className="text-sm">{investigation.rationale.recommended_action}</p>
                </div>
                <div>
                  <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Confidence
                  </h3>
                  <p className="font-display text-3xl tabular-nums">
                    {(investigation.rationale.confidence * 100).toFixed(0)}
                    <span className="text-base text-muted-foreground">%</span>
                  </p>
                </div>
              </div>
              {investigation.rationale.policy_citations.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Policy citations
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {investigation.rationale.policy_citations.map((c, i) => (
                      <li
                        key={i}
                        className="border-l-2 border-accent bg-accent/10 py-2 pl-4 text-sm"
                      >
                        <p className="italic">{c.text}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {c.source}
                          {c.chapter ? ` · ch. ${c.chapter}` : ""}
                          {c.section ? ` · § ${c.section}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No investigation on file</EmptyTitle>
                <EmptyDescription>
                  The streaming investigation pipeline will appear here once initiated. Triage,
                  evidence, and AI-synthesized rationale stream sequentially.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border/70 pt-3">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

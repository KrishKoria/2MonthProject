import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, CircleAlert, FileSearch } from "lucide-react";

import { GuidePanel } from "@/components/guidance/GuidePanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeChip } from "@/components/claims/CodeChip";
import { InvestigationConsole } from "@/components/investigation/InvestigationConsole";
import { RiskPanel } from "@/components/investigation/RiskPanel";
import { ApiError, apiFor } from "@/lib/api";
import { ANOMALY_COPY, CLAIM_GUIDE_STEPS, STATUS_COPY } from "@/lib/experience-copy";
import { getServerApiBaseUrl } from "@/lib/server-api";
import type { ClaimDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ClaimDetailPage({ params }: PageProps) {
  const { id } = await params;
  const api = apiFor(await getServerApiBaseUrl());
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
  const riskBand = risk_score?.risk_band ?? null;
  const bandColor =
    riskBand === "high"
      ? "var(--chart-1)"
      : riskBand === "medium"
      ? "var(--chart-2)"
      : riskBand === "low"
      ? "var(--chart-3)"
      : "var(--muted-foreground)";

  const netDelta = claim.charge_amount - claim.paid_amount;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-8 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/claims" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
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
            Claim review
          </div>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight md:text-6xl">
            Claim <em className="text-muted-foreground">#</em>{" "}
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
            {STATUS_COPY[claim.claim_status].label}
          </Badge>
          {claim.anomaly_type ? (
            <Badge
              className="text-[10px] uppercase tracking-wider text-background"
              style={{ background: bandColor }}
            >
              {ANOMALY_COPY[claim.anomaly_type].label}
            </Badge>
          ) : null}
        </div>
      </header>

      <GuidePanel
        className="mt-6 animate-rise"
        eyebrow="Case guide"
        title="This screen walks you from signal to decision."
        description="Read the score in plain language, check the facts the system found, and then choose what should happen next."
        steps={CLAIM_GUIDE_STEPS}
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {/* Risk panel */}
        <Card className="animate-rise lg:col-span-1" style={{ animationDelay: "80ms" }}>
          <CardHeader>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Why this claim stands out
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              Start with the score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RiskPanel riskScore={risk_score} riskBand={riskBand} />
          </CardContent>
        </Card>

        {/* Claim facts */}
        <Card className="animate-rise lg:col-span-2" style={{ animationDelay: "150ms" }}>
          <CardHeader>
            <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
              Claim facts
            </CardDescription>
            <CardTitle className="font-display text-3xl font-normal italic">
              What is on the claim
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Money strip */}
            <div className="grid grid-cols-3 gap-4 rounded-md border border-border/70 bg-background px-4 py-4">
              <Money label="Charged" value={claim.charge_amount} />
              <Money label="Allowed" value={claim.allowed_amount} muted />
              <Money label="Paid" value={claim.paid_amount} muted />
            </div>
            {netDelta > 0 ? (
              <div className="-mt-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Unpaid delta{" "}
                <span className="font-mono tabular-nums text-foreground">
                  ${netDelta.toFixed(2)}
                </span>
              </div>
            ) : null}

            <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <Fact label="Member" value={claim.member_id} mono />
              <Fact label="Provider" value={claim.provider_id} mono />
              <Fact label="Place of service" value={claim.place_of_service} mono />
              <Fact
                label="Procedure codes"
                value={
                  <div className="flex flex-wrap gap-1">
                    {claim.procedure_codes.map((c) => (
                      <CodeChip key={c} code={c} kind="CPT/HCPCS" />
                    ))}
                  </div>
                }
              />
              <Fact
                label="Diagnosis codes"
                value={
                  <div className="flex flex-wrap gap-1">
                    {claim.diagnosis_codes.map((c) => (
                      <CodeChip key={c} code={c} kind="ICD-10" />
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
      <Card className="mt-5 animate-rise overflow-hidden" style={{ animationDelay: "220ms" }}>
        <CardHeader>
          <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
            Guided review
          </CardDescription>
          <CardTitle className="font-display text-3xl font-normal italic">
            Facts, summary, and next step
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-8">
          <InvestigationConsole claimId={claim.claim_id} initial={investigation} />
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

function Money({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-display text-2xl tabular-nums ${muted ? "text-muted-foreground" : ""}`}
      >
        <span className="text-sm text-muted-foreground">$</span>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

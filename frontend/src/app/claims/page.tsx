"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { api, type ClaimsQuery } from "@/lib/api";
import type { AnomalyType, ClaimListItem, ClaimStatus, RiskBand } from "@/lib/types";

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  upcoding: "Upcoding",
  ncci_violation: "NCCI",
  duplicate: "Duplicate",
};

const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending_review: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  escalated: "Escalated",
  manual_review_required: "Manual review",
};

function statusVariant(s: ClaimStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "accepted":
      return "secondary";
    case "rejected":
      return "destructive";
    case "escalated":
      return "default";
    case "manual_review_required":
      return "outline";
    default:
      return "outline";
  }
}

function RiskPill({ band, score }: { band: RiskBand | null; score: number | null }) {
  if (!band) return <span className="text-muted-foreground">—</span>;
  const color =
    band === "high" ? "var(--chart-1)" : band === "medium" ? "var(--chart-2)" : "var(--chart-3)";
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      <span className="font-mono text-xs capitalize">{band}</span>
      {score != null ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {score.toFixed(0)}
        </span>
      ) : null}
    </div>
  );
}

export default function ClaimsExplorerPage() {
  const [query, setQuery] = useState<ClaimsQuery>({
    page: 1,
    page_size: 25,
    sort_by: "risk_score",
    sort_dir: "desc",
  });
  const [rows, setRows] = useState<ClaimListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listClaims(query)
      .then((res) => {
        if (cancelled) return;
        setRows(res.claims);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load claims");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const update = (patch: Partial<ClaimsQuery>) =>
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));

  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 25;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const filterCount = useMemo(
    () =>
      [query.risk_band, query.anomaly_type, query.status, query.provider_id, query.date_from, query.date_to].filter(
        Boolean,
      ).length,
    [query],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-10 pb-16">
      <header className="animate-rise flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Search className="size-3" />
          Claims explorer
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Every claim, <em className="text-muted-foreground">in view.</em>
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SlidersHorizontal className="size-4" />
            {filterCount > 0 ? (
              <span>
                {filterCount} filter{filterCount === 1 ? "" : "s"} applied
              </span>
            ) : (
              <span>No filters applied</span>
            )}
          </div>
        </div>
      </header>

      <Card className="mt-8 animate-rise" style={{ animationDelay: "100ms" }}>
        <CardHeader>
          <CardDescription className="text-[11px] uppercase tracking-[0.14em]">Filters</CardDescription>
          <CardTitle className="font-display text-2xl font-normal italic">Refine the queue</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel>Risk band</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={query.risk_band ?? ""}
                onValueChange={(v) => update({ risk_band: v || undefined })}
                className="justify-start"
              >
                <ToggleGroupItem value="high">High</ToggleGroupItem>
                <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                <ToggleGroupItem value="low">Low</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="anomaly">Anomaly type</FieldLabel>
              <Select
                value={query.anomaly_type ?? "all"}
                onValueChange={(v) => update({ anomaly_type: v === "all" ? undefined : v })}
              >
                <SelectTrigger id="anomaly">
                  <SelectValue placeholder="Any anomaly" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Any anomaly</SelectItem>
                    <SelectItem value="upcoding">Upcoding</SelectItem>
                    <SelectItem value="ncci_violation">NCCI violation</SelectItem>
                    <SelectItem value="duplicate">Duplicate</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="provider">Provider ID</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  id="provider"
                  placeholder="PRV-…"
                  value={query.provider_id ?? ""}
                  onChange={(e) => update({ provider_id: e.target.value || undefined })}
                />
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="sort">Sort by</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={query.sort_by ?? "risk_score"}
                  onValueChange={(v) => update({ sort_by: v })}
                >
                  <SelectTrigger id="sort" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="risk_score">Risk score</SelectItem>
                      <SelectItem value="service_date">Service date</SelectItem>
                      <SelectItem value="claim_receipt_date">Receipt date</SelectItem>
                      <SelectItem value="charge_amount">Charge</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Toggle sort direction"
                  onClick={() =>
                    update({ sort_dir: query.sort_dir === "asc" ? "desc" : "asc" })
                  }
                >
                  <ArrowUpDown />
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="date_from">From</FieldLabel>
              <Input
                id="date_from"
                type="date"
                value={query.date_from ?? ""}
                onChange={(e) => update({ date_from: e.target.value || undefined })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="date_to">To</FieldLabel>
              <Input
                id="date_to"
                type="date"
                value={query.date_to ?? ""}
                onChange={(e) => update({ date_to: e.target.value || undefined })}
              />
            </Field>
            <Field className="md:col-span-2 lg:col-span-2">
              <FieldLabel>Actions</FieldLabel>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setQuery({ page: 1, page_size: 25, sort_by: "risk_score", sort_dir: "desc" })
                  }
                >
                  Reset filters
                </Button>
                <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                  {loading ? "…" : `${total.toLocaleString()} matches`}
                </Badge>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="mt-5 animate-rise overflow-hidden" style={{ animationDelay: "180ms" }}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px] uppercase tracking-[0.14em]">
                <TableHead>Claim</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Anomaly</TableHead>
                <TableHead className="text-right">Charge</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`s-${i}`}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((c) => (
                    <TableRow key={c.claim_id} className="group">
                      <TableCell>
                        <Link
                          href={`/claims/${c.claim_id}`}
                          className="font-mono text-xs text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
                        >
                          {c.claim_id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.member_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.provider_id}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {c.service_date}
                      </TableCell>
                      <TableCell>
                        <RiskPill band={c.risk_band} score={c.risk_score} />
                      </TableCell>
                      <TableCell>
                        {c.anomaly_type ? (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                            {ANOMALY_LABELS[c.anomaly_type]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        ${c.charge_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(c.claim_status)} className="text-[10px]">
                          {STATUS_LABEL[c.claim_status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>

        {!loading && rows.length === 0 ? (
          <div className="p-8">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No claims match these filters</EmptyTitle>
                <EmptyDescription>
                  Try widening the date range or clearing the anomaly selector.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQuery({ page: 1, page_size: 25, sort_by: "risk_score", sort_dir: "desc" })
                  }
                >
                  Reset filters
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : null}

        {error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : null}

        <Separator />
        <div className="flex items-center justify-between gap-4 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-mono">
            {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => update({ page: Math.max(1, page - 1) })}
            >
              <ChevronLeft />
              Prev
            </Button>
            <span className="px-2 font-mono">
              {page} / {lastPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage || loading}
              onClick={() => update({ page: page + 1 })}
            >
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

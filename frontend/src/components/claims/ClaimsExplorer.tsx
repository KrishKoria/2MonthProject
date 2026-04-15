"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { GuidePanel } from "@/components/guidance/GuidePanel";
import { HelpTooltip } from "@/components/guidance/HelpTooltip";
import type { ClaimsQuery } from "@/lib/api";
import {
  CLAIMS_PAGE_SIZES,
  claimsQueriesEqual,
  claimsQueryToSearchParams,
  DEFAULT_CLAIMS_QUERY,
  getClaimsFilterCount,
} from "@/lib/claims-query";
import {
  ANOMALY_COPY,
  QUEUE_GUIDE_STEPS,
  RISK_BAND_COPY,
  STATUS_COPY,
  TERM_COPY,
} from "@/lib/experience-copy";
import { cn } from "@/lib/utils";
import type { AnomalyType, ClaimListItem, ClaimStatus, RiskBand } from "@/lib/types";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ClaimsExplorerProps {
  initialQuery: ClaimsQuery;
  rows: ClaimListItem[];
  total: number;
  error: string | null;
}

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  upcoding: ANOMALY_COPY.upcoding.label,
  ncci_violation: ANOMALY_COPY.ncci_violation.label,
  duplicate: ANOMALY_COPY.duplicate.label,
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  pending_review: STATUS_COPY.pending_review.label,
  accepted: STATUS_COPY.accepted.label,
  rejected: STATUS_COPY.rejected.label,
  escalated: STATUS_COPY.escalated.label,
  manual_review_required: STATUS_COPY.manual_review_required.label,
};

const SORT_LABELS: Record<NonNullable<ClaimsQuery["sort_by"]>, string> = {
  risk_score: "Priority score",
  service_date: "Date of service",
  claim_receipt_date: "Date received",
  charge_amount: "Charge amount",
};

function statusVariant(s: ClaimStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "accepted":
      return "secondary";
    case "rejected":
      return "destructive";
    case "escalated":
      return "default";
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
      <span className="font-mono text-xs">{RISK_BAND_COPY[band].label}</span>
      {score != null ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {score.toFixed(0)}
        </span>
      ) : null}
    </div>
  );
}

export function ClaimsExplorer({
  initialQuery,
  rows,
  total,
  error,
}: ClaimsExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<ClaimsQuery>(initialQuery);

  const activeFilterCount = getClaimsFilterCount(initialQuery);
  const draftDirty = !claimsQueriesEqual(draft, initialQuery);
  const page = initialQuery.page ?? DEFAULT_CLAIMS_QUERY.page;
  const pageSize = initialQuery.page_size ?? DEFAULT_CLAIMS_QUERY.page_size;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function navigate(nextQuery: ClaimsQuery) {
    const params = claimsQueryToSearchParams(nextQuery).toString();
    const href = params ? `${pathname}?${params}` : pathname;

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function applyDraft() {
    navigate({ ...draft, page: 1 });
  }

  function resetFilters() {
    const cleanQuery = { ...DEFAULT_CLAIMS_QUERY };
    setDraft(cleanQuery);
    navigate(cleanQuery);
  }

  function updatePage(nextPage: number) {
    navigate({ ...initialQuery, page: nextPage });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-10 pb-16">
      <header className="animate-rise flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Search className="size-3" />
          Review queue
          <span className="inline-block size-1 rounded-full bg-[var(--chart-2)]" />
          Shared filters stay in the URL
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Find a claim, <em className="text-muted-foreground">then open the story.</em>
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
              Start with the highest-priority claims or narrow the list only when
              you need to. Once you open a row, the case view explains what stands
              out and what to do next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <SlidersHorizontal className="size-4" />
            <span>
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
                : "No active filters"}
            </span>
            {draftDirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
            {isPending ? (
              <Badge variant="secondary" className="gap-1.5">
                <Spinner />
                Refreshing queue
              </Badge>
            ) : (
              <Badge variant="outline">{total.toLocaleString()} matches</Badge>
            )}
          </div>
        </div>
      </header>

      <GuidePanel
        className="mt-8 animate-rise"
        eyebrow="Queue guide"
        title="The queue is meant to feel navigable."
        description="You can review from left to right: find a claim, open the case, and let the guided review explain the evidence."
        steps={QUEUE_GUIDE_STEPS}
      />

      <Card className="mt-8 animate-rise" style={{ animationDelay: "100ms" }}>
        <CardHeader>
          <CardDescription className="text-[11px] uppercase tracking-[0.14em]">
            Filters
          </CardDescription>
          <CardTitle className="font-display text-2xl font-normal italic">
            Narrow the list only if you need to
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field className="md:col-span-2 xl:col-span-2">
              <FieldLabel htmlFor="search">Search claims</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  id="search"
                  placeholder="Claim number, provider, member, or code"
                  value={draft.search ?? ""}
                  onChange={(event) =>
                    setDraft((query) => ({
                      ...query,
                      search: event.target.value || undefined,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyDraft();
                    }
                  }}
                />
              </InputGroup>
            </Field>

            <Field>
              <div className="flex items-center gap-1.5">
                <FieldLabel>Priority</FieldLabel>
                <HelpTooltip label="Priority score">{TERM_COPY.riskScore}</HelpTooltip>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={draft.risk_band ?? ""}
                onValueChange={(value) =>
                  setDraft((query) => ({
                    ...query,
                    risk_band: (value || undefined) as RiskBand | undefined,
                  }))
                }
                className="justify-start"
              >
                <ToggleGroupItem value="high">High</ToggleGroupItem>
                <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                <ToggleGroupItem value="low">Low</ToggleGroupItem>
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="anomaly">Problem type</FieldLabel>
              <Select
                value={draft.anomaly_type ?? "all"}
                onValueChange={(value) =>
                  setDraft((query) => ({
                    ...query,
                    anomaly_type: value === "all" ? undefined : (value as AnomalyType),
                  }))
                }
              >
                <SelectTrigger id="anomaly">
                  <SelectValue placeholder="Any problem type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Any problem type</SelectItem>
                    <SelectItem value="upcoding">{ANOMALY_COPY.upcoding.label}</SelectItem>
                    <SelectItem value="ncci_violation">
                      {ANOMALY_COPY.ncci_violation.label}
                    </SelectItem>
                    <SelectItem value="duplicate">{ANOMALY_COPY.duplicate.label}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="status">Review status</FieldLabel>
              <Select
                value={draft.status ?? "all"}
                onValueChange={(value) =>
                  setDraft((query) => ({
                    ...query,
                    status: value === "all" ? undefined : (value as ClaimStatus),
                  }))
                }
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Any review status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Any review status</SelectItem>
                    <SelectItem value="pending_review">
                      {STATUS_COPY.pending_review.label}
                    </SelectItem>
                    <SelectItem value="manual_review_required">
                      {STATUS_COPY.manual_review_required.label}
                    </SelectItem>
                    <SelectItem value="accepted">{STATUS_COPY.accepted.label}</SelectItem>
                    <SelectItem value="rejected">{STATUS_COPY.rejected.label}</SelectItem>
                    <SelectItem value="escalated">{STATUS_COPY.escalated.label}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="date_from">From</FieldLabel>
              <Input
                id="date_from"
                type="date"
                value={draft.date_from ?? ""}
                onChange={(event) =>
                  setDraft((query) => ({
                    ...query,
                    date_from: event.target.value || undefined,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="date_to">To</FieldLabel>
              <Input
                id="date_to"
                type="date"
                value={draft.date_to ?? ""}
                onChange={(event) =>
                  setDraft((query) => ({
                    ...query,
                    date_to: event.target.value || undefined,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="sort_by">Sort by</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={draft.sort_by ?? DEFAULT_CLAIMS_QUERY.sort_by}
                  onValueChange={(value) =>
                    setDraft((query) => ({
                      ...query,
                      sort_by: value as NonNullable<ClaimsQuery["sort_by"]>,
                    }))
                  }
                >
                  <SelectTrigger id="sort_by" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(SORT_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Sort ${draft.sort_dir === "asc" ? "descending" : "ascending"}`}
                  onClick={() =>
                    setDraft((query) => ({
                      ...query,
                      sort_dir: query.sort_dir === "asc" ? "desc" : "asc",
                    }))
                  }
                >
                  <ArrowUpDown />
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="page_size">Rows per page</FieldLabel>
              <Select
                value={String(draft.page_size ?? DEFAULT_CLAIMS_QUERY.page_size)}
                onValueChange={(value) =>
                  setDraft((query) => ({
                    ...query,
                    page_size: Number(value) as ClaimsQuery["page_size"],
                  }))
                }
              >
                <SelectTrigger id="page_size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CLAIMS_PAGE_SIZES.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value} rows
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="md:col-span-2 xl:col-span-4">
              <FieldLabel>Actions</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={applyDraft} disabled={isPending}>
                  {isPending ? <Spinner data-icon="inline-start" /> : null}
                  Apply filters
                </Button>
                <Button variant="outline" size="sm" onClick={resetFilters} disabled={isPending}>
                  <FilterX data-icon="inline-start" />
                  Clear all
                </Button>
                <Badge variant="outline" className="ml-auto">
                  {draft.sort_dir === "asc" ? "Ascending" : "Descending"} by{" "}
                  {SORT_LABELS[draft.sort_by ?? DEFAULT_CLAIMS_QUERY.sort_by]}
                </Badge>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mt-5 animate-rise">
          <AlertTitle>Unable to load the claim queue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="mt-5 animate-rise overflow-hidden" style={{ animationDelay: "180ms" }}>
        <div
          className={cn(
            "overflow-x-auto transition-opacity duration-200",
            isPending && "opacity-45",
          )}
          aria-busy={isPending}
        >
          <Table>
            <TableHeader>
                <TableRow className="text-[11px] uppercase tracking-[0.14em]">
                <TableHead>Claim</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service date</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Problem type</TableHead>
                <TableHead className="text-right">Charge</TableHead>
                <TableHead>Review status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? Array.from({ length: Math.min(pageSize, 8) }).map((_, index) => (
                    <TableRow key={`pending-${index}`}>
                      {Array.from({ length: 8 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((claim) => (
                    <TableRow key={claim.claim_id}>
                      <TableCell>
                        <Link
                          href={`/claims/${claim.claim_id}`}
                          className="font-mono text-xs text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
                        >
                          {claim.claim_id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {claim.member_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {claim.provider_id}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {claim.service_date}
                      </TableCell>
                      <TableCell>
                        <RiskPill band={claim.risk_band} score={claim.risk_score} />
                      </TableCell>
                      <TableCell>
                        {claim.anomaly_type ? (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                            {ANOMALY_LABELS[claim.anomaly_type]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        ${claim.charge_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(claim.claim_status)} className="text-[10px]">
                          {STATUS_LABELS[claim.claim_status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>

        {!error && !isPending && rows.length === 0 ? (
          <div className="p-8">
            <Empty>
                <EmptyHeader>
                <EmptyTitle>No claims match these filters</EmptyTitle>
                <EmptyDescription>
                  Clear one or two filters to bring more claims back into view.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <FilterX data-icon="inline-start" />
                  Reset filters
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : null}

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-mono">
            {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending || !!error}
              onClick={() => updatePage(Math.max(1, page - 1))}
            >
              <ChevronLeft data-icon="inline-start" />
              Prev
            </Button>
            <span className="px-2 font-mono">
              {page} / {lastPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage || isPending || !!error}
              onClick={() => updatePage(page + 1)}
            >
              Next
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

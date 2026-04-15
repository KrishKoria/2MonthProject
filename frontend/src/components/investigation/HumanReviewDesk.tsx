"use client";

import { useState } from "react";
import {
  CheckCircle2,
  FilePenLine,
  OctagonX,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { DECISION_META } from "@/lib/investigation";
import type { Investigation, HumanDecision, DecisionKind } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface HumanReviewDeskProps {
  claimId: string;
  humanDecision: HumanDecision | null;
  disabled?: boolean;
  onDecisionSaved: (investigation: Investigation) => void;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function HumanReviewDesk({
  claimId,
  humanDecision,
  disabled = false,
  onDecisionSaved,
}: HumanReviewDeskProps) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<DecisionKind>(
    humanDecision?.decision ?? "accepted",
  );
  const [notes, setNotes] = useState(humanDecision?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeDecision = DECISION_META[humanDecision?.decision ?? decision];

  async function saveDecision() {
    setIsSubmitting(true);

    try {
      const investigation = await api.submitDecision(
        claimId,
        decision,
        notes.trim() || undefined,
      );
      onDecisionSaved(investigation);
      setOpen(false);
      toast.success("Human decision recorded", {
        description: `${DECISION_META[decision].label} saved to the case record.`,
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to save reviewer decision";
      toast.error("Unable to save decision", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-5 py-5 shadow-[0_18px_40px_-30px_rgba(18,18,18,0.28)]">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.15),transparent)]"
        />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <FilePenLine className="size-3" />
                Choose the next step
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={activeDecision.badgeVariant}>
                  {humanDecision ? activeDecision.label : "Waiting for your decision"}
                </Badge>
                {humanDecision ? (
                  <Badge variant="outline">
                    Logged {formatTimestamp(humanDecision.decided_at)}
                  </Badge>
                ) : null}
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {humanDecision
                  ? activeDecision.summary
                  : "When the facts and draft summary look solid, record what should happen next."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => {
                  setDecision("accepted");
                  setOpen(true);
                }}
              >
                <CheckCircle2 data-icon="inline-start" />
                {DECISION_META.accepted.actionLabel}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={disabled}
                onClick={() => {
                  setDecision("rejected");
                  setOpen(true);
                }}
              >
                <OctagonX data-icon="inline-start" />
                {DECISION_META.rejected.actionLabel}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  setDecision("escalated");
                  setOpen(true);
                }}
              >
                <ShieldAlert data-icon="inline-start" />
                {DECISION_META.escalated.actionLabel}
              </Button>
            </div>
          </div>

          {humanDecision ? (
            <div className="grid gap-4 rounded-xl border border-border/70 bg-background/70 px-4 py-4 md:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Reviewer notes
                </span>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {humanDecision.notes ?? "No reviewer notes were recorded for this decision."}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Chain of custody
                </span>
                <div className="flex flex-col gap-1 text-sm text-foreground/90">
                  <span className="font-mono text-xs">
                    {humanDecision.investigator_id ?? "Not recorded"}
                  </span>
                  <span className="text-muted-foreground">
                    {formatTimestamp(humanDecision.decided_at)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
              No decision has been saved yet. Choose the next step when you are ready.
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save the next step</DialogTitle>
            <DialogDescription>
              Confirm what should happen next for claim{" "}
              <span className="font-mono">{claimId}</span>.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel>Recommended next step</FieldLabel>
              <ToggleGroup
                type="single"
                value={decision}
                onValueChange={(value) => {
                  if (value) {
                    setDecision(value as DecisionKind);
                  }
                }}
                className="justify-start"
              >
                <ToggleGroupItem value="accepted">
                  {DECISION_META.accepted.actionLabel}
                </ToggleGroupItem>
                <ToggleGroupItem value="rejected">
                  {DECISION_META.rejected.actionLabel}
                </ToggleGroupItem>
                <ToggleGroupItem value="escalated">
                  {DECISION_META.escalated.actionLabel}
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>{DECISION_META[decision].summary}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="review-notes">Reviewer notes</FieldLabel>
              <Textarea
                id="review-notes"
                placeholder="Write the short reason for your decision and any follow-up action."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={6}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={saveDecision} disabled={isSubmitting}>
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              Save decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

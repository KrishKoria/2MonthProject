import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface CodeChipProps {
  code: string;
  kind: string;
}

export function CodeChip({ code, kind }: CodeChipProps) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger className="cursor-help rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] transition-colors hover:border-foreground/60">
        {code}
      </HoverCardTrigger>
      <HoverCardContent className="w-56 text-xs">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {kind}
        </div>
        <div className="mt-1 font-mono text-sm">{code}</div>
        <p className="mt-2 text-muted-foreground italic">
          Synthetic code — descriptor lookups disabled in v1.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

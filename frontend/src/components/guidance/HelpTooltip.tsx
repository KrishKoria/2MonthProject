"use client";

import { CircleHelp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function HelpTooltip({ label, children, className }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full text-support-foreground/70 transition-colors hover:text-support-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-support/40",
          className,
        )}
      >
        <CircleHelp className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent sideOffset={8} className="max-w-64 items-start">
        <div className="flex flex-col gap-1">
          <p className="font-medium">{label}</p>
          <p className="text-background/85">{children}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

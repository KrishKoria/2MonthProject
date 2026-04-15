import Link from "next/link";
import { ArrowRight, Compass, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GuideStep } from "@/lib/experience-copy";
import { cn } from "@/lib/utils";

interface GuidePanelProps {
  eyebrow: string;
  title: string;
  description: string;
  steps: GuideStep[];
  className?: string;
}

export function GuidePanel({
  eyebrow,
  title,
  description,
  steps,
  className,
}: GuidePanelProps) {
  const [firstStep] = steps;

  return (
    <Card
      className={cn(
        "border border-support/20 bg-support-soft/80 shadow-[0_22px_60px_-44px_rgba(55,96,173,0.32)]",
        className,
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-support-foreground/80">
          <Compass className="size-3" />
          {eyebrow}
          <Badge variant="outline" className="border-support/30 bg-background/70">
            Plain-language guide
          </Badge>
        </div>
        <div className="flex flex-col gap-2">
          <CardTitle className="font-display text-3xl font-normal tracking-tight text-support-foreground md:text-4xl">
            {title}
          </CardTitle>
          <CardDescription className="max-w-3xl text-sm leading-relaxed text-support-foreground/75">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={firstStep?.value} className="gap-5">
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto border-b border-support/20 pb-2"
          >
            {steps.map((step, index) => (
              <TabsTrigger key={step.value} value={step.value}>
                <span className="font-mono text-[10px] text-muted-foreground">{index + 1}.</span>
                {step.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {steps.map((step) => (
            <TabsContent key={step.value} value={step.value}>
              <div className="grid gap-4 md:grid-cols-[1.35fr_0.95fr]">
                <div className="rounded-xl border border-support/20 bg-background/75 p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-support-foreground/75">
                    <Sparkles className="size-3" />
                    {step.summary}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground/85">
                    {step.detail}
                  </p>
                </div>

                <div className="flex flex-col gap-4 rounded-xl border border-support/20 bg-background/65 p-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      Helpful note
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                      {step.hint ?? "You can move through this workflow in order. The interface will keep explaining what each step means."}
                    </p>
                  </div>

                  {step.ctaLabel && step.ctaHref ? (
                    <Button size="sm" asChild className="w-fit">
                      <Link href={step.ctaHref}>
                        {step.ctaLabel}
                        <ArrowRight data-icon="inline-end" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

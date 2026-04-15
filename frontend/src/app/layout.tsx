import type { Metadata } from "next";
import Link from "next/link";
import { Activity, LayoutDashboard, ShieldAlert, Sparkles } from "lucide-react";

import "./globals.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Sentinel · Claims Investigation Intelligence",
  description: "Guided claims review workspace for a synthetic Medicare Part B demonstration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground flex flex-col bg-paper">
        <TooltipProvider delayDuration={150}>
          <div className="flex items-center justify-center gap-2 border-b border-border/70 bg-accent/60 px-4 py-1.5 text-[11px] font-medium tracking-wide text-accent-foreground uppercase">
            <span className="inline-block size-1.5 rounded-full bg-accent-foreground/70 animate-soft-pulse" />
            Synthetic data demonstration — no real PHI
          </div>
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
            <nav className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-3.5 text-sm">
              <Link href="/" className="group flex items-center gap-2.5">
                <span className="relative flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ShieldAlert className="size-4" />
                </span>
                <span className="flex flex-col leading-none">
                  <span className="font-display text-lg italic">Sentinel</span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Claims Intelligence
                  </span>
                </span>
              </Link>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex items-center gap-1">
                <NavLink href="/" icon={<LayoutDashboard className="size-3.5" />}>
                  Home
                </NavLink>
                <NavLink href="/claims" icon={<Activity className="size-3.5" />}>
                  Review queue
                </NavLink>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <Badge variant="outline" className="gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                  <span className="inline-block size-1.5 rounded-full bg-[var(--chart-3)]" />
                  Synthetic review environment
                </Badge>
              </div>
            </nav>
            <div className="border-t border-border/70 bg-support-soft/70">
              <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-6 py-2 text-xs text-support-foreground">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5" />
                  New here? Start with the review queue. Info dots explain unfamiliar terms.
                </div>
                <Button variant="outline" size="sm" asChild className="ml-auto border-support/30 bg-background/70">
                  <Link href="/claims?risk_band=high">Open high-priority claims</Link>
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border/70 bg-background/50">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 text-xs text-muted-foreground">
              <span className="font-mono">v0.1 · guided synthetic review workspace</span>
              <span className="font-display italic">Clear signals. Human decisions.</span>
            </div>
          </footer>
          <Toaster position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {icon}
      {children}
    </Link>
  );
}

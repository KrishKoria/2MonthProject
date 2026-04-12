import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { Activity, LayoutDashboard, ShieldAlert } from "lucide-react";

import "./globals.css";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel · Claims Investigation Intelligence",
  description: "Payment integrity workbench for Medicare Part B — synthetic data demonstration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
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
                  Dashboard
                </NavLink>
                <NavLink href="/claims" icon={<Activity className="size-3.5" />}>
                  Claims
                </NavLink>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <Badge variant="outline" className="gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                  <span className="inline-block size-1.5 rounded-full bg-[var(--chart-3)]" />
                  API online
                </Badge>
              </div>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border/70 bg-background/50">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 text-xs text-muted-foreground">
              <span className="font-mono">v0.1 · deterministic-first pipeline</span>
              <span className="font-display italic">Measure twice. Pay once.</span>
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

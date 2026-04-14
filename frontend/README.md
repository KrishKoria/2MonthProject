# Sentinel Frontend

Sentinel is a Medicare Part B claims investigation workbench built against a synthetic dataset. The frontend is responsible for turning backend scoring, evidence retrieval, and streamed AI rationale generation into a reviewable, human-governed workflow.

## Problem Statement

Claims investigators need a queue that does more than rank risk. They need:

- A portfolio view of population-level risk and anomaly mix
- A claim queue that can be filtered, sorted, and shared via URL state
- A dossier page that combines claim facts, model reasoning, evidence sources, and streamed rationale output
- A human review surface that records the final payment decision after the machine-generated rationale is inspected

The product is intentionally deterministic-first. Rules, NCCI checks, duplicate search, and provider context sit alongside ML scores and AI synthesis, but the final disposition still belongs to a reviewer.

## Key Screens

- `/` dashboard for analytics overview and queue entry points
- `/claims` server-driven queue explorer with canonical search params
- `/claims/[id]` investigation console with streamed rationale and reviewer decision capture

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS v4
- shadcn/ui (`radix-nova`)
- Bun for package management, scripts, and tests

## Local Development

Install dependencies:

```bash
bun install
```

Start the app:

```bash
bun run dev
```

Browser-side requests default to same-origin `/api/...` routes. For server-side rendering
against a separate backend origin, set `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL`.

To point it somewhere else, set:

```bash
API_BASE_URL=http://your-api-host:8000
NEXT_PUBLIC_API_BASE_URL=http://your-api-host:8000
```

## Verification

```bash
bun test
bun run lint
bun run build
```

## Notes

- The UI is built against synthetic data only. No real PHI should be used.
- Fonts are local/system-based so the production build does not depend on external font downloads.
- The queue page treats the URL as the source of truth for filtering and pagination.

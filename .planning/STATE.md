# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-15)

**Core value:** Every claim decision must carry clear authority and an immutable audit trail — the right person makes each call, and that record never changes.
**Current milestone:** Milestone 1 — Auth + Review Hierarchy
**Current phase:** None started

## Current Position

Phase: 0 of 5 (Not started)
Plan: -
Status: Ready to plan
Last activity: 2026-04-15 — Roadmap created

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table and docs/auth-hierarchy-review-workflow-decisions.md (53 decisions).

Key constraints for implementation:
- middleware.ts must be named proxy.ts (Next.js 16 breaking rename)
- Use @neondatabase/serverless, not pg (Better Auth requires WebSocket transactions)
- Two connection strings: DATABASE_URL (pooled) + DATABASE_URL_UNPOOLED (for drizzle-kit)
- SSE passthrough: `return fetch(proxyRequest)` — never await body
- Derived fields: Pydantic @computed_field, not stored values
- Investigation history stored as JSON, not Parquet

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-15
Stopped at: Roadmap initialized — ready to begin Phase 1
Resume file: None

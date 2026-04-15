---
phase: 01-auth-foundation
plan: 05
subsystem: frontend-auth-surface
tags:
  - auth
  - nextjs
  - route-handlers
  - better-auth
  - migrations
requires:
  - 01-04
provides:
  - server auth session helpers
  - better auth catch-all route
  - admin deactivate/reactivate endpoints
  - initial drizzle migration for phase 1 auth foundation
affects:
  - frontend/src/lib/auth-session.ts
  - frontend/src/app/api/auth/[...all]/route.ts
  - frontend/src/app/api/admin/users/[userId]/deactivate/route.ts
  - frontend/src/app/api/admin/users/[userId]/reactivate/route.ts
  - frontend/drizzle/migrations/0000_awesome_salo.sql
  - frontend/drizzle/migrations/meta/0000_snapshot.json
  - frontend/drizzle/migrations/meta/_journal.json
tech-stack:
  added: []
  patterns:
    - server-only Better Auth session helpers
    - Next.js 16 async route params
    - Better Auth toNextJsHandler catch-all mounting
    - banUser and unbanUser admin route enforcement
key-files:
  created:
    - frontend/src/lib/auth-session.ts
    - frontend/src/app/api/auth/[...all]/route.ts
    - frontend/src/app/api/admin/users/[userId]/deactivate/route.ts
    - frontend/src/app/api/admin/users/[userId]/reactivate/route.ts
    - frontend/drizzle/migrations/0000_awesome_salo.sql
    - frontend/drizzle/migrations/meta/0000_snapshot.json
    - frontend/drizzle/migrations/meta/_journal.json
  modified:
    - frontend/src/db/schema.ts
    - frontend/src/lib/access-control.test.ts
    - frontend/src/lib/access-types.test.ts
    - frontend/src/lib/auth.test.ts
    - frontend/src/lib/auth-session.test.ts
    - frontend/src/app/api/admin/users/[userId]/deactivate/route.test.ts
    - frontend/src/components/investigation/InvestigationConsole.test.tsx
decisions:
  - Better Auth route mounting now lives at /api/auth/[...all] via toNextJsHandler(auth).
  - Admin deactivate/reactivate routes enforce requireAdminSession before banUser or unbanUser calls.
  - The Better Auth schema inspection was performed with a temporary generated auth-schema.ts file and not kept in git.
metrics:
  completed_at: 2026-04-15T17:45:00Z
  duration: 00:24:00
---

# Phase 01 Plan 05: Auth Surface Summary

Phase 1's auth surface is now complete. Server helpers wrap Better Auth session access, `/api/auth/*` is mounted through App Router, admin deactivate/reactivate endpoints are implemented, and the initial Drizzle migration was generated after confirming Better Auth's schema only emits a single `role` column plus `banned`.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | `49e2b0d` | Added `frontend/src/lib/auth-session.ts` |
| 2 | `cfa463c` | Added Better Auth catch-all and admin deactivate/reactivate route handlers |
| Gate cleanup | `de7ac75` | Phase-gate fixes for Bun test typings, lint noise, and migration artifacts |

## Verification Evidence

- `cd frontend && bun run tsc --noEmit` passed after cleanup.
- `cd frontend && bun test` passed: 45/45 tests green.
- `cd frontend && bun run lint` passed.
- Auth contract checks passed:
  - `disableSignUp: true` present in `frontend/src/lib/auth.ts`
  - `cookieCache` absent from `frontend/src/lib/auth.ts`
  - `drizzle-orm/neon-serverless` present in `frontend/src/db/client.ts`
  - `DATABASE_URL_UNPOOLED` present in `frontend/drizzle.config.ts`
- `cd frontend && bunx auth@latest generate` produced a schema with:
  - one `role` column
  - `banned` present
  - `user`, `session`, `account`, and `verification` tables
- `cd frontend && bunx drizzle-kit generate` produced `frontend/drizzle/migrations/0000_awesome_salo.sql`

## Deviations from Plan

None in the implementation scope. The only extra work was gate cleanup in adjacent tests so the plan could satisfy the phase-level `tsc` and `lint` requirements.

## Issues Encountered

- Better Auth's generator is interactive by default, so the schema inspection step required piping `y` into the prompt to emit `auth-schema.ts`.
- The generated schema file was used for inspection only and removed from git afterward.
- Existing Bun test files used matcher/import patterns that were acceptable at runtime but failed TypeScript and ESLint gate checks until cleaned up.

## Self-Check: PASSED

- Required route/helper files exist on disk.
- Phase-gate verification commands are green.
- Better Auth schema inspection and Drizzle migration generation both completed successfully.

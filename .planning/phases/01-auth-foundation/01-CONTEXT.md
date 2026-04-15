# Phase 1: Auth Foundation - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Neon Postgres DB wired via Drizzle adapter, Better Auth configured with email/password invite-setup login + Google + Microsoft social login, same-email trusted account linking, session persistence, and deactivation/reactivation with immediate session revocation. Entry pages (sign-in, accept-invite, bootstrap) and middleware are Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Email Provider
- **D-01:** Use **Resend** for sending invite setup links. Type-safe SDK, no SMTP config, Next.js-native. Add `resend` to frontend dependencies.
- **D-02:** `mailer.ts` wraps the Resend client and exposes a single `sendInviteEmail(to, setupUrl)` function.

### Deactivation Mechanism
- **D-03:** Map "deactivated" onto Better Auth's admin plugin `banUser()` / `unbanUser()`. BA's ban immediately revokes all active sessions — no manual `revokeAllSessions()` call needed. Domain language stays "deactivated/reactivated" in the app layer; the underlying DB column is `banned: boolean`.
- **D-04:** On reactivation, call `unbanUser()` from the admin plugin. Role is preserved (no change to role field during ban/unban).

### Role and Status Field Placement
- **D-05:** Store `role: AppRole` and any invitation state as `additionalFields` on Better Auth's auto-generated `user` table. One table, no join needed for role checks.
- **D-06:** `AppRole = "reviewer" | "senior_reviewer" | "admin"` is owned by the app — Better Auth's own `role` field in the admin plugin is left unused. The `additionalFields` config makes `role` a proper typed column on the BA user table.
- **D-07:** The admin plugin's built-in `role` field is NOT used — `additionalFields.role` is the canonical role source.

### Drizzle Migration Strategy
- **D-08:** Use `drizzle-kit generate` — SQL migration files are generated and committed to git alongside `schema.ts`. No `drizzle-kit push`.
- **D-09:** Two connection strings: `DATABASE_URL` (Neon pooled, for runtime) and `DATABASE_URL_UNPOOLED` (Neon direct, for drizzle-kit generate/migrate). Both are required in `.env`.
- **D-10:** `drizzle.config.ts` points to `DATABASE_URL_UNPOOLED` and `drizzle/migrations/` output dir.

### Already-Locked (from decisions doc — do not re-debate)
- **D-11:** `@neondatabase/serverless` adapter (not `pg`) — Better Auth requires WebSocket transactions for Neon.
- **D-12:** Account linking: `trustedProviders: ["google", "microsoft", "email-password"]`, `allowDifferentEmails: false`.
- **D-13:** Single role per user. No compound roles.
- **D-14:** Invite expires 7 days. Re-invite cancels previous pending invite for that email.
- **D-15:** Reactivation restores previous role automatically; fresh login required.
- **D-16:** `middleware.ts` must be named `proxy.ts` (Next.js 16 breaking rename) — but proxy.ts is Phase 2 scope, noted here for schema awareness.

### Claude's Discretion
- Exact Better Auth config shape beyond what's documented
- Internal helper naming (`requireSession`, `getOptionalSession`, etc.)
- Error message copy for blocked/deactivated sign-in attempts
- Drizzle schema column types and defaults beyond what the decisions doc specifies

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth + Access Architecture
- `docs/auth-hierarchy-review-workflow-decisions.md` — 53 architectural decisions covering auth, roles, deactivation, invitation lifecycle, social login, and all schema/field choices. Mandatory reading — contains the authoritative spec for every behavior in this phase.
- `docs/superpowers/plans/2026-04-15-better-auth-review-hierarchy.md` — Detailed task breakdown with file maps, step-by-step instructions, and exact code shapes for the auth foundation. Task 1 is the primary Phase 1 task.

### Project Constraints
- `.planning/STATE.md` §Accumulated Context — Critical implementation notes: `@neondatabase/serverless` not `pg`, two connection strings, proxy.ts naming.
- `CLAUDE.md` — Stack constraints, naming conventions, and package manager rules (bun for frontend, uv for backend).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/lib/api.ts` — Typed REST client with `ApiError` class and base URL normalization. Auth fetch wrapper should follow the same pattern.
- `frontend/src/lib/server-api.ts` — Server-side base URL resolution. After Phase 3, proxied routes will share this pattern.
- `frontend/src/app/layout.tsx` — Session provider will need to be wired here (Better Auth client provider or server session check at layout level).

### Established Patterns
- Named exports for helpers and utilities: `export function requireSession()`, `export function canResolveEscalation()`.
- `camelCase` for TS helpers, `PascalCase` for types (`AppRole`, `SessionUser`).
- No barrel files — consumers import from concrete modules.
- `frontend/src/lib/` is where auth helpers go (`auth.ts`, `auth-client.ts`, `auth-session.ts`, `access-control.ts`).

### Integration Points
- `frontend/src/app/layout.tsx` — Add session provider / session context.
- `frontend/next.config.ts` — Current blind `/api/*` rewrite will be replaced in Phase 3; schema and auth config should not depend on it.
- `frontend/package.json` — Add: `better-auth`, `drizzle-orm`, `@neondatabase/serverless`, `resend`. DevDeps: `drizzle-kit`.
- No existing auth layer — this is a greenfield addition alongside a fully operational claims pipeline.

</code_context>

<specifics>
## Specific Ideas

- Decisions doc §26 (account linking) gives the exact Better Auth config: `account.accountLinking.enabled = true`, `trustedProviders = ["google", "microsoft", "email-password"]`, `allowDifferentEmails = false`.
- Decisions doc §29 (invitation lifecycle): token expires 7 days, re-invite cancels previous. Implement as a `custom_invitations` table with `token`, `email`, `role`, `expires_at`, `accepted_at`.
- Decisions doc §30 (deactivation): `banUser()` handles session revocation; no separate revocation step.
- Decisions doc §31 (reactivation): `unbanUser()` restores access; role field untouched by ban/unban.
- STATE.md confirms: `middleware.ts` must become `proxy.ts` (Next.js 16) — but that's Phase 2. Schema and auth setup in Phase 1 should not require the proxy to exist yet.

</specifics>

<deferred>
## Deferred Ideas

- Session middleware / whole-app protection — Phase 2
- Entry pages (sign-in, accept-invite, bootstrap) — Phase 2
- Admin console UI — Phase 5
- Notification emails beyond invite setup — v2

</deferred>

---

*Phase: 01-auth-foundation*
*Context gathered: 2026-04-15*

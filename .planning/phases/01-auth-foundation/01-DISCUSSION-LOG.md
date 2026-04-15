# Phase 1: Auth Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in 01-CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-15
**Phase:** 01-auth-foundation
**Mode:** discuss
**Areas discussed:** Email provider, Deactivation mechanism, Role placement, Migration strategy

## Gray Areas Presented

| Area | Description |
|------|-------------|
| Email provider for invites | No email service configured — needed for invite setup links |
| Admin plugin vs custom deactivation | BA admin plugin ban/unban vs custom status field |
| Role and status field placement | additionalFields on user table vs separate access table |
| Drizzle migration strategy | drizzle-kit generate vs push |

## Decisions Made

### Email Provider
- **Selected:** Resend
- **Alternatives presented:** Nodemailer+SMTP, defer (log to console)
- **Rationale:** Modern API built for Next.js, type-safe SDK, no SMTP config overhead

### Deactivation Mechanism
- **Selected:** Better Auth admin plugin ban/unban
- **Alternatives presented:** Custom status field + manual session revocation
- **Rationale:** BA's banUser() revokes all active sessions automatically — no manual revokeAllSessions() call needed

### Role Field Placement
- **Selected:** additionalFields on BA user table
- **Alternatives presented:** Separate access table, BA admin plugin's built-in role field
- **Rationale:** One table, no join for role checks, typed AppRole enum owned by the app

### Migration Strategy
- **Selected:** drizzle-kit generate (committed migration files)
- **Alternatives presented:** drizzle-kit push
- **Rationale:** Proper audit trail, safe for production deploys, DATABASE_URL_UNPOOLED already allocated

## Corrections Made

No corrections — all recommended options accepted.

## Pre-Locked (from decisions doc, not re-debated)

- @neondatabase/serverless adapter (not pg)
- Same-email trusted account linking, no cross-email linking
- Single role per user
- 7-day invite expiry, re-invite cancels previous
- Immediate session revocation on deactivation
- Role restored on reactivation, fresh login required

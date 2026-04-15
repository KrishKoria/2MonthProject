# Phase 1: Auth Foundation - Research

**Researched:** 2026-04-15
**Domain:** Better Auth + Drizzle ORM + Neon Postgres + Resend (Next.js 16 / React 19)
**Confidence:** HIGH (core stack verified via npm registry, official docs, and codebase grep)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use Resend for sending invite setup links. Add `resend` to frontend dependencies.
- **D-02:** `mailer.ts` wraps the Resend client — single `sendInviteEmail(to, setupUrl)` function.
- **D-03:** Map "deactivated" onto Better Auth admin plugin `banUser()` / `unbanUser()`. BA's ban immediately revokes all sessions. Domain language stays "deactivated/reactivated"; underlying DB column is `banned: boolean`.
- **D-04:** On reactivation, call `unbanUser()`. Role is preserved (no change to role field during ban/unban).
- **D-05:** Store `role: AppRole` and invitation state as `additionalFields` on Better Auth's auto-generated `user` table.
- **D-06:** `AppRole = "reviewer" | "senior_reviewer" | "admin"` is owned by the app. Better Auth's own admin `role` field is left unused.
- **D-07:** Admin plugin's built-in `role` field is NOT used — `additionalFields.role` is canonical.
- **D-08:** Use `drizzle-kit generate` — SQL migration files generated and committed. No `drizzle-kit push`.
- **D-09:** Two connection strings: `DATABASE_URL` (Neon pooled, runtime) and `DATABASE_URL_UNPOOLED` (Neon direct, drizzle-kit).
- **D-10:** `drizzle.config.ts` points to `DATABASE_URL_UNPOOLED` and `drizzle/migrations/` output dir.
- **D-11:** `@neondatabase/serverless` adapter (not `pg`) — Better Auth requires WebSocket transactions for Neon.
- **D-12:** Account linking: `trustedProviders: ["google", "microsoft", "email-password"]`, `allowDifferentEmails: false`.
- **D-13:** Single role per user. No compound roles.
- **D-14:** Invite expires 7 days. Re-invite cancels previous pending invite for that email.
- **D-15:** Reactivation restores previous role automatically; fresh login required.
- **D-16:** `middleware.ts` must be named `proxy.ts` (Next.js 16 breaking rename) — Phase 2 scope; Phase 1 must not depend on proxy existing.

### Claude's Discretion

- Exact Better Auth config shape beyond what is documented in decisions
- Internal helper naming (`requireSession`, `getOptionalSession`, etc.)
- Error message copy for blocked/deactivated sign-in attempts
- Drizzle schema column types and defaults beyond what the decisions doc specifies

### Deferred Ideas (OUT OF SCOPE)

- Session middleware / whole-app protection — Phase 2
- Entry pages (sign-in, accept-invite, bootstrap) — Phase 2
- Admin console UI — Phase 5
- Notification emails beyond invite setup — v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can log in with email and a setup link (invite-only, no public signup) | `emailAndPassword.disableSignUp: true` + custom `custom_invitations` table + server-side `auth.api.signUpEmail()` |
| AUTH-02 | User can log in with Google social login — only if Google email matches an invited email | `socialProviders.google` + `account.accountLinking.allowDifferentEmails: false` |
| AUTH-03 | User can log in with Microsoft social login — only if Microsoft email matches an invited email | `socialProviders.microsoft` + same account linking policy |
| AUTH-05 | Authenticated session persists across browser refresh and page navigation | Better Auth cookie-based sessions, 7-day default, `authClient.useSession()` hook |
| AUTH-06 | Deactivated user sessions are revoked immediately — future sign-in attempts are blocked | `admin.banUser()` sets `banned: true` and revokes all sessions immediately |
| ACCESS-03 | Admin can deactivate a user — all active sessions revoked immediately | `auth.api.banUser()` server-side call |
| ACCESS-04 | Admin can reactivate a user — previous role restored, fresh sign-in required | `auth.api.unbanUser()` server-side call; role field untouched by ban/unban |
</phase_requirements>

---

## Summary

Phase 1 wires the authentication backbone: Neon Postgres via Drizzle ORM, Better Auth with email/password (invite-only), Google, and Microsoft social providers, an `additionalFields` role column, deactivation via the admin plugin's ban mechanism, and the invitation lifecycle table. No UI is shipped in Phase 1 — that is Phase 2. The output is a working auth server (`/api/auth/[...all]/route.ts`), a typed auth client, session helpers, and a seeded Drizzle schema with migrations.

The single most important technical hazard in this phase is the `@neondatabase/serverless` driver selection. The `neon-http` Drizzle driver (`drizzle-orm/neon-http`) lacks transaction support, which breaks Better Auth's social OAuth account creation path at runtime with the error "No transactions support in neon-http driver." The fix is to use the WebSocket-based Pool from `@neondatabase/serverless` with `drizzle-orm/neon-serverless`. This matches D-11 exactly, but the db/client.ts code shape from the pre-existing plan draft (`docs/superpowers/plans/2026-04-15-better-auth-review-hierarchy.md` Step 2) incorrectly uses `drizzle-orm/node-postgres` with `pg.Pool` — the planner must not use that shape.

The planning doc also references `pg` as a direct dependency and uses `drizzle-orm/node-postgres` + `pg.Pool`. This contradicts D-11 and will break on Neon. The correct stack is `@neondatabase/serverless` with `drizzle-orm/neon-serverless` for runtime and `DATABASE_URL_UNPOOLED` for drizzle-kit.

**Primary recommendation:** Use `drizzle-orm/neon-serverless` (Pool + WebSocket) for the runtime db client; use `DATABASE_URL_UNPOOLED` only in `drizzle.config.ts`. Do NOT add `pg` as a runtime dependency.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auth session issuance | Frontend Server (Next.js) | — | Better Auth runs entirely in Next.js; FastAPI never sees raw sessions |
| Social OAuth callbacks | Frontend Server (Next.js) | — | `/api/auth/[...all]` handles all BA routes including OAuth redirect |
| Email invite dispatch | Frontend Server (Next.js) | — | Resend SDK called from server-side route handler, not browser |
| Drizzle schema / migrations | Frontend Server (Next.js) | — | Auth and invitation tables live in Neon, accessed via frontend's db client |
| User ban/unban enforcement | Frontend Server (Next.js) | — | Admin plugin API calls happen server-side; sessions are revoked at BA layer |
| Session reading in server components | Frontend Server (Next.js) | — | `requireSession()` / `getOptionalSession()` wrap `auth.api.getSession()` |
| Session reading in client components | Browser | — | `authClient.useSession()` React hook reads BA cookie |
| Role enforcement on API mutations | API / Backend (FastAPI) | — | Phase 3; Phase 1 does not wire FastAPI at all |
| Invitation token validation | Frontend Server (Next.js) | — | Custom `custom_invitations` table queried before account creation |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | 1.6.3 | Auth framework: sessions, social login, admin plugin | Locked by project decision; framework-agnostic, Next.js handler built-in |
| `drizzle-orm` | 0.45.2 | ORM + schema definition for Neon Postgres | Locked; type-safe, generates SQL migrations, plays with BA |
| `@neondatabase/serverless` | 1.0.2 | Neon Postgres driver (WebSocket Pool for transactions) | Locked (D-11); HTTP driver breaks BA social auth |
| `drizzle-kit` | 0.31.10 | Migration generation (`drizzle-kit generate`) | Dev-only; generates committed SQL migration files |
| `resend` | 6.11.0 | Email dispatch for invite setup links | Locked (D-01); type-safe SDK, zero SMTP config |
| `ws` | 8.20.0 | Node.js WebSocket constructor for Neon serverless Pool | Required when running outside a browser/Cloudflare environment |

All versions verified against npm registry on 2026-04-15. [VERIFIED: npm registry]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bufferutil` | 4.1.0 | Optional perf upgrade for `ws` WebSocket | Neon Pool recommends alongside `ws` |
| `zod` | (already in ecosystem) | Input validation if needed in invite routes | Only if BA doesn't cover a validation edge |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@neondatabase/serverless` (WebSocket Pool) | `pg` (node-postgres) | `pg` works fine for transactions but requires a direct connection — Neon's pooler doesn't support pg on the serverless endpoint; WebSocket Pool is the Neon-native choice |
| `@neondatabase/serverless` (WebSocket Pool) | `drizzle-orm/neon-http` | neon-http is simpler but breaks on BA social auth due to missing transaction support — do NOT use |
| `resend` | Nodemailer / SMTP | Nodemailer requires SMTP credentials and more config; Resend is locked |

**Installation (runtime):**
```bash
bun add better-auth drizzle-orm @neondatabase/serverless resend ws bufferutil
```
**Installation (dev):**
```bash
bun add -d drizzle-kit
```

**Version verification:** Verified via `npm view <package> version` on 2026-04-15. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                 Next.js App (frontend)              Neon Postgres
   |                           |                                   |
   |-- POST /api/auth/* ------>| BA handler (toNextJsHandler)      |
   |                           |-- session query ----------------->|
   |                           |<-- session result ----------------|
   |<-- Set-Cookie (session) --|                                   |
   |                           |                                   |
   |-- GET /api/auth/callback/google -->| OAuth callback            |
   |                           |-- validate invite email           |
   |                           |-- create user (transaction) ----->|
   |                           |<-- user created -----------------|
   |<-- redirect to / ---------|                                   |
   |                           |                                   |
   | [server component]        |                                   |
   |                           |-- requireSession() (server) ----->|
   |                           |<-- Session | null ----------------|
   |                           |                                   |
   | Admin deactivates user    |                                   |
   |-- POST /api/admin/users/[id]/deactivate -->|                  |
   |                           |-- auth.api.banUser() ------------>|
   |                           |   (banned=true, revoke sessions)  |
   |<-- 200 OK -----------------|                                  |
```

### Recommended Project Structure (new files in Phase 1)

```
frontend/
├── drizzle.config.ts          # Points to DATABASE_URL_UNPOOLED, out: drizzle/migrations/
├── drizzle/
│   └── migrations/            # Committed SQL migration files (drizzle-kit generate output)
├── src/
│   ├── db/
│   │   ├── client.ts          # Neon Pool + drizzle-orm/neon-serverless export
│   │   └── schema.ts          # custom_invitations + access_audit_events tables
│   └── lib/
│       ├── auth.ts            # betterAuth() server instance
│       ├── auth-client.ts     # createAuthClient() browser instance
│       ├── auth-session.ts    # requireSession(), requireAdminSession(), getOptionalSession()
│       ├── access-control.ts  # AppRole type + canResolveEscalation(), canAccessAdmin()
│       ├── access-types.ts    # SessionUser, InviteRecord types
│       └── mailer.ts          # sendInviteEmail(to, setupUrl) wrapping Resend
├── src/app/api/auth/
│   └── [...all]/route.ts      # toNextJsHandler(auth) — mounts entire BA handler
└── .env.example               # Updated with BA + Neon + Resend + social provider vars
```

### Pattern 1: Neon WebSocket Pool db client (CORRECT for Better Auth)

**What:** Use `@neondatabase/serverless` Pool + `drizzle-orm/neon-serverless` for full transaction support.
**When to use:** Always — this is the only Neon driver that supports the transactions Better Auth requires for social signup.

```typescript
// frontend/src/db/client.ts
// Source: https://orm.drizzle.team/docs/connect-neon (CITED)
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Required in Node.js: Neon needs a WebSocket constructor
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });
```

### Pattern 2: Better Auth server instance (`auth.ts`)

**What:** Single betterAuth() instance with email/password (invite-only), Google, Microsoft, admin plugin, Drizzle adapter, and additionalFields for AppRole.
**When to use:** Imported by the `/api/auth/[...all]/route.ts` handler and all server-side session helpers.

```typescript
// frontend/src/lib/auth.ts
// Source: https://www.better-auth.com/docs/installation (CITED)
// Source: https://www.better-auth.com/docs/plugins/admin (CITED)
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // No public signup — admin-invited only
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: "common", // allows personal + org accounts
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "microsoft", "email-password"],
      allowDifferentEmails: false, // D-12: email must match invite
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",  // actual values: "reviewer" | "senior_reviewer" | "admin"
        required: false,
        defaultValue: null,
        input: false,    // users cannot self-assign role
      },
    },
  },
  plugins: [admin()],   // adds banUser/unbanUser + banned field
});

export type AppSession = typeof auth.$Infer.Session;
```

### Pattern 3: Auth route handler

```typescript
// frontend/src/app/api/auth/[...all]/route.ts
// Source: https://www.better-auth.com/docs/installation (CITED)
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

### Pattern 4: Auth-client (browser)

```typescript
// frontend/src/lib/auth-client.ts
// Source: https://www.better-auth.com/docs/installation (CITED)
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3000",
  plugins: [adminClient()],
});
```

### Pattern 5: Server-side session helpers

```typescript
// frontend/src/lib/auth-session.ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function getOptionalSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getOptionalSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  if (session.user.role !== "admin") throw new Error("Forbidden");
  return session;
}
```

### Pattern 6: Deactivation / reactivation

```typescript
// Server-side route handler, e.g. POST /api/admin/users/[userId]/deactivate
// Source: https://www.better-auth.com/docs/plugins/admin (CITED)
import { auth } from "@/lib/auth";

// Deactivate: revokes all sessions immediately, blocks future sign-in
await auth.api.banUser({ body: { userId }, headers: await headers() });

// Reactivate: restores access, role is untouched
await auth.api.unbanUser({ body: { userId }, headers: await headers() });
```

### Pattern 7: drizzle.config.ts

```typescript
// frontend/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!, // direct (non-pooled) for drizzle-kit
  },
});
```

### Pattern 8: custom_invitations table

```typescript
// frontend/src/db/schema.ts (excerpt)
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const customInvitations = pgTable("custom_invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(), // AppRole
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }), // set on re-invite
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### Anti-Patterns to Avoid

- **Using `drizzle-orm/neon-http` with Better Auth:** The HTTP driver has no transaction support. Social OAuth sign-up will fail at runtime with "No transactions support in neon-http driver." Always use `drizzle-orm/neon-serverless` with the `Pool` class. [VERIFIED: github.com/better-auth/better-auth/issues/4747]
- **Using `pg` (node-postgres) as Neon runtime driver:** `pg` requires long-lived TCP connections. Neon's serverless endpoint requires WebSocket Pool. `pg` would require the unpooled connection string and will not work in most serverless environments.
- **Using the admin plugin's built-in `role` field:** D-07 explicitly forbids this. `additionalFields.role` is canonical. Do not call `auth.api.setRole()` for the app role — only for the BA admin `role` field (which we don't use).
- **Setting `cookieCache: true` without understanding the implication:** Cookie caching means revoked sessions can remain active on other devices until the cookie cache TTL expires. Since session revocation on ban is a hard requirement (AUTH-06), do NOT enable `cookieCache` in this phase.
- **Calling `banUser` from browser code:** `admin.banUser()` from the auth client requires the calling session to have admin authority. Always call from a server-side route handler via `auth.api.banUser()` after verifying the caller's session with `requireAdminSession()`.
- **Running `drizzle-kit generate` against `DATABASE_URL` (pooled):** The pooled Neon connection does not support DDL operations. Always use `DATABASE_URL_UNPOOLED` for drizzle-kit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie signing and verification | Custom JWT/cookie logic | Better Auth's built-in session management | HMAC signing, rotation, expiry, DB-backed revocation all handled |
| OAuth 2.0 state/PKCE flows | Manual OAuth redirects | Better Auth `socialProviders` config | Provider-specific quirks, CSRF protection, token exchange are library-internal |
| Account deactivation + session revocation | Manual session table delete + status flag | `auth.api.banUser()` | Atomically sets `banned: true` and revokes all sessions in one call |
| DB schema auto-generation for BA tables | Manual `CREATE TABLE` for user/session/account | `bunx auth@latest generate` or `bunx drizzle-kit generate` | BA auto-generates the required tables from config |
| Social email matching | Custom post-auth hook | `account.accountLinking.allowDifferentEmails: false` | Built-in — rejects social sign-in if email does not match existing invited account |

**Key insight:** Better Auth generates the user/session/account/verification tables automatically. Do not hand-author those four tables. Only hand-author `custom_invitations` and `access_audit_events` (app-specific tables not owned by BA).

---

## Common Pitfalls

### Pitfall 1: neon-http driver breaks social OAuth signup

**What goes wrong:** Social login (Google, Microsoft) fails at account creation with "No transactions support in neon-http driver" and error code `unable_to_create_user`.
**Why it happens:** Better Auth wraps user creation in a database transaction. The `drizzle-orm/neon-http` driver uses Neon's HTTP API which does not support transactions.
**How to avoid:** Use `drizzle-orm/neon-serverless` with `Pool` from `@neondatabase/serverless`. Set `neonConfig.webSocketConstructor = ws` in Node.js environments.
**Warning signs:** Social login completes OAuth flow (gets code from Google/Microsoft) but then fails with a 500 when Better Auth tries to create/link the user. Email/password may appear to work but social doesn't.

### Pitfall 2: Admin plugin's `role` field conflicts with `additionalFields.role`

**What goes wrong:** The admin plugin adds its own `role` column to the `user` table (defaulting to "user"). If the app also adds `additionalFields.role`, there are two `role` columns and type confusion.
**Why it happens:** The admin plugin schema and the `additionalFields` config both try to own a `role` column.
**How to avoid:** Per D-07, never call `setRole()` from the admin plugin for app roles. The `additionalFields.role` is the canonical role column. The admin plugin's `role` field should be ignored. In the Drizzle schema, be aware that both columns will appear — name them distinctly or explicitly omit the admin plugin's role from type inference.
**Warning signs:** TypeScript shows two `role` properties on the User type; `auth.$Infer.Session.user.role` returns "user" instead of the expected app role.

### Pitfall 3: Cookie caching silently breaks session revocation

**What goes wrong:** A banned user's session cookie is still accepted for minutes after `banUser()` because Better Auth serves the cached cookie data without hitting the database.
**Why it happens:** When `session.cookieCache.enabled: true`, session reads are short-circuited. The ban check happens at DB level, which is bypassed.
**How to avoid:** Do not enable `cookieCache` in Phase 1. Auth-06 requires immediate revocation.
**Warning signs:** Calling `banUser()` succeeds (returns 200) but the banned user can still access protected routes for several minutes.

### Pitfall 4: Drizzle-kit running against pooled connection

**What goes wrong:** `bunx drizzle-kit generate` or `bunx drizzle-kit migrate` hangs or fails with connection errors.
**Why it happens:** Neon's pooled connection string (PgBouncer) does not support DDL operations or extended query protocol features that drizzle-kit uses.
**How to avoid:** `drizzle.config.ts` must use `DATABASE_URL_UNPOOLED`. Runtime `db/client.ts` uses `DATABASE_URL` (pooled Pool).
**Warning signs:** `drizzle-kit` hangs indefinitely, or errors with "prepared statements are not supported."

### Pitfall 5: Microsoft social login requires tenantId

**What goes wrong:** Microsoft login only works for accounts within a specific Azure AD tenant, or fails entirely.
**Why it happens:** Without `tenantId: "common"`, the Microsoft provider defaults to a restrictive tenant scope.
**How to avoid:** Set `tenantId: "common"` to accept both personal (MSA) and organizational (Entra ID) accounts.
**Warning signs:** Microsoft OAuth redirects succeed but token exchange fails for certain Microsoft accounts.

### Pitfall 6: Next.js 16 middleware filename breaking rename

**What goes wrong:** `middleware.ts` at the repo root is ignored by Next.js 16; session gating silently does not run.
**Why it happens:** Next.js 16 renamed the middleware file to `proxy.ts` as a breaking change.
**How to avoid:** Phase 2 must create `proxy.ts`, not `middleware.ts`. Phase 1 does not create a middleware file at all — auth setup only, no route guarding.
**Warning signs:** Middleware logs never appear; unauthenticated users reach protected pages.

---

## Code Examples

Verified patterns from official and community sources:

### Better Auth schema generation

```bash
# Generate BA tables + custom app tables
# Source: https://www.better-auth.com/docs/installation (CITED)
cd frontend
bunx auth@latest generate  # outputs to a suggested schema — review and merge into src/db/schema.ts
bunx drizzle-kit generate  # generates SQL migration from schema.ts
```

### Admin plugin banUser (server-side only)

```typescript
// Source: https://www.better-auth.com/docs/plugins/admin (CITED)
// Called from a POST /api/admin/users/[userId]/deactivate route handler
const session = await requireAdminSession();  // throws if not admin
await auth.api.banUser({
  body: { userId: params.userId },
  headers: await headers(),
});
```

### Social sign-in (client-side trigger)

```typescript
// Source: https://www.better-auth.com/docs/authentication/google (CITED)
// Called from the sign-in page (Phase 2 scope — example only)
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/",
});
```

### Resend invite email

```typescript
// frontend/src/lib/mailer.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteEmail(to: string, setupUrl: string) {
  await resend.emails.send({
    from: process.env.MAIL_FROM!,
    to,
    subject: "You're invited — set up your account",
    html: `<p>Follow this link to set up your account: <a href="${setupUrl}">${setupUrl}</a></p>`,
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `neon-http` driver for BA | WebSocket `Pool` (`neon-serverless`) | BA+Neon issues emerged mid-2025 | HTTP driver breaks social auth transactions |
| `pg` (node-postgres) with Neon | `@neondatabase/serverless` Pool | Neon serverless adoption | `pg` requires direct connections; Pool manages WebSocket fanout |
| Auth handler at `pages/api/auth` | App Router `app/api/auth/[...all]/route.ts` | Next.js App Router stable | Pages Router handler deprecated for new Next.js apps |

**Deprecated/outdated:**
- `drizzle-orm/neon-http` with Better Auth: Transaction support gap makes it unsuitable for auth use cases involving social login or any multi-step DB operations.
- The planning doc draft (`docs/superpowers/plans/2026-04-15-better-auth-review-hierarchy.md`, Task 1 Step 2) uses `drizzle-orm/node-postgres` + `pg.Pool` — this is incorrect per D-11 and must not be followed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `additionalFields.role` and the admin plugin's `role` field coexist in the schema without collision; the app simply ignores admin plugin's `role` | Architecture Patterns — Pattern 2 | Could cause a duplicate column error during migration or type confusion at runtime |
| A2 | `neonConfig.webSocketConstructor = ws` is sufficient to make the Pool work in a Next.js 16 server environment (Node.js runtime, not Edge) | Standard Stack / Pattern 1 | If Next.js routes run on Edge runtime, `ws` is not available and a different strategy is needed |
| A3 | `disableSignUp: true` in `emailAndPassword` config prevents self-registration while still allowing admin-side `auth.api.signUpEmail()` calls | Pattern 2 | If the server-side `signUpEmail` is also blocked, the invite acceptance flow (Phase 2) breaks |

**User confirmation needed on A1 and A3** before the invite-acceptance route is written in Phase 2.

---

## Open Questions

1. **Does the admin plugin add a `role` column that conflicts with `additionalFields.role`?**
   - What we know: The admin plugin docs show it adds `role` to the user table; `additionalFields` also adds `role`.
   - What's unclear: Whether BA merges these or creates two columns; which one wins in the schema.
   - Recommendation: Run `bunx auth@latest generate` on a test branch first and inspect the output schema before writing `schema.ts`.

2. **Does `auth.api.signUpEmail()` bypass `disableSignUp: true`?**
   - What we know: `disableSignUp` blocks the public endpoint. Server-side `auth.api.*` calls often bypass plugin restrictions.
   - What's unclear: Whether there's a separate flag or the server-side API is always unrestricted.
   - Recommendation: Verify empirically in a Wave 0 smoke test or check BA source code.

3. **Does Better Auth's account linking guard enforce email matching at the BA layer, or does the app need a custom hook?**
   - What we know: `allowDifferentEmails: false` is in the config. D-12 relies on this.
   - What's unclear: Whether this alone prevents social sign-in for emails not in the `custom_invitations` table (vs. merely requiring email match with an existing BA user).
   - Recommendation: The planner should add a `callbackURL` hook in `auth.ts` that checks `custom_invitations` before completing social sign-in.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Frontend package management | Yes | 1.3.12 | — |
| uv | Backend package management | Yes | 0.9.18 | — |
| Node.js / npm | Version lookups | Yes (via bun) | — | — |
| Neon Postgres | BA + custom tables | Assumed (env var) | — | No fallback — requires valid `DATABASE_URL` |
| Google OAuth App | AUTH-02 | Not verified | — | Must be created in Google Cloud Console |
| Microsoft Entra App | AUTH-03 | Not verified | — | Must be created in Azure Portal |
| Resend account | AUTH-01 invite emails | Not verified | — | Can use `MAIL_PROVIDER=console` (log-only) during dev |
| `BETTER_AUTH_SECRET` | Session signing | Not set (env var) | — | Must be generated: `openssl rand -base64 32` |

**Missing dependencies with no fallback:**
- Valid Neon Postgres `DATABASE_URL` and `DATABASE_URL_UNPOOLED` — required for any BA table creation or migration.

**Missing dependencies with fallback:**
- Google OAuth App credentials — dev can skip Google login and use email/password only until configured.
- Microsoft OAuth App credentials — same as Google.
- Resend API key — use `MAIL_PROVIDER=console` during development to log invite URLs instead of sending email.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` (frontend), `pytest` + `pytest-asyncio` (backend) |
| Frontend config | `frontend/package.json` (`bun test`) |
| Backend config | `backend/pyproject.toml` |
| Quick run (frontend) | `cd frontend && bun test` |
| Quick run (backend) | `cd backend && uv run pytest -q tests/` |
| Full suite | `cd frontend && bun test && cd ../backend && uv run pytest -q tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `disableSignUp: true` blocks public signup endpoint | unit | `bun test src/lib/auth.test.ts` | Wave 0 |
| AUTH-01 | Invite token is stored and validated before account creation | unit | `bun test src/lib/auth.test.ts` | Wave 0 |
| AUTH-02 | Google social login rejects mismatched email | unit/integration | `bun test src/lib/auth.test.ts` | Wave 0 |
| AUTH-03 | Microsoft social login rejects mismatched email | unit/integration | `bun test src/lib/auth.test.ts` | Wave 0 |
| AUTH-05 | Session persists after simulated page reload (cookie present) | unit | `bun test src/lib/auth-session.test.ts` | Wave 0 |
| AUTH-06 | `banUser()` call updates `banned: true` in db and revokes sessions | unit (mocked db) | `bun test src/lib/auth-session.test.ts` | Wave 0 |
| ACCESS-03 | Non-admin call to deactivate route returns 403 | unit | `bun test src/app/api/admin/users/[userId]/deactivate.test.ts` | Wave 0 |
| ACCESS-04 | `unbanUser()` restores access; role field is unchanged | unit (mocked db) | `bun test src/lib/auth-session.test.ts` | Wave 0 |

> Phase 1 has no backend changes — all tests are frontend (`bun:test`). Backend tests exist for existing functionality and should remain green without modification.

### Sampling Rate

- **Per task commit:** `cd frontend && bun test`
- **Per wave merge:** Full suite: `cd frontend && bun test && bun run lint`
- **Phase gate:** All frontend tests green, `bun run lint` passes, `bunx drizzle-kit generate` produces valid migration files before marking phase complete.

### Wave 0 Gaps

- `frontend/src/lib/auth.test.ts` — covers AUTH-01, AUTH-02, AUTH-03 (invite-only enforcement, email matching)
- `frontend/src/lib/auth-session.test.ts` — covers AUTH-05, AUTH-06, ACCESS-03, ACCESS-04 (session helpers, ban/unban)
- `frontend/src/app/api/admin/users/[userId]/deactivate.test.ts` — covers ACCESS-03 (403 enforcement)

---

## Project Constraints (from CLAUDE.md)

| Constraint | Impact on Phase 1 |
|------------|-------------------|
| Package manager: Bun for frontend | Use `bun add`, not `npm install` |
| No npm/pip | Never use `npm install` or `pip install` in plan tasks |
| Better Auth lives entirely in Next.js | No auth logic in FastAPI for Phase 1 |
| FastAPI trusts only proxied identity envelope | Not wired in Phase 1; this is Phase 3 |
| Named exports for helpers | `export function requireSession()`, not default exports |
| camelCase for TS helpers | `requireSession`, `getOptionalSession`, not `require_session` |
| PascalCase for types | `AppRole`, `SessionUser`, `InviteRecord` |
| No barrel files | Import from concrete modules: `@/lib/auth`, not `@/lib` |
| `@/*` alias for frontend | Use `@/db/client`, `@/lib/auth`, etc. |
| Code style: semicolons in lib files | Match `frontend/src/lib/api.ts` — use semicolons |
| ESLint 9 + eslint-config-next | Run `bun run lint` after each task |

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Better Auth: bcrypt password hashing, session token rotation |
| V3 Session Management | Yes | Better Auth: DB-backed session table, 7-day expiry, revocation on ban |
| V4 Access Control | Yes | `requireAdminSession()` before any admin API route; `additionalFields.role` as canonical role |
| V5 Input Validation | Yes | Validate invite email format before inserting into `custom_invitations`; Better Auth validates OAuth callback state |
| V6 Cryptography | Yes — never hand-roll | Better Auth handles bcrypt; `BETTER_AUTH_SECRET` for session signing — use `openssl rand -base64 32` |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invite token enumeration | Information Disclosure | Tokens should be cryptographically random (128-bit entropy), stored hashed, single-use |
| Session fixation | Elevation of Privilege | Better Auth rotates session token on sign-in — do not override |
| CSRF on admin endpoints | Tampering | Better Auth's `toNextJsHandler` includes CSRF protection by default for state-changing requests |
| Bypass via direct browser-to-FastAPI | Elevation of Privilege | Not wired in Phase 1; FastAPI proxy secret enforcement is Phase 3 |
| Social email spoofing | Spoofing | `allowDifferentEmails: false` + invite-email pre-check prevents attacker from linking arbitrary social account |
| Ban bypass via cookie cache | Elevation of Privilege | Do NOT enable `cookieCache` — session reads must hit DB so `banned` check is always current |

---

## Sources

### Primary (HIGH confidence)
- Better Auth official docs — installation, admin plugin, session management, social providers, additional fields [CITED: better-auth.com/docs]
- Drizzle ORM official docs — Neon serverless Pool connection [CITED: orm.drizzle.team/docs/connect-neon]
- npm registry — package versions verified 2026-04-15 [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- Medium article (Abolfazl Ghodrati, 2025) — `neon-http` + `drizzle-orm/neon-http` working code example (pre-transaction-issue) [https://medium.com/@abgkcode]
- GitHub issue #4747 better-auth/better-auth — "No transactions support in neon-http driver" root cause confirmed [VERIFIED: github.com/better-auth/better-auth/issues/4747]
- GitHub issue #3678 better-auth/better-auth — `@neondatabase/serverless` 1.0.0 tagged-template incompatibility with BA [VERIFIED: github.com/better-auth/better-auth/issues/3678]

### Tertiary (LOW confidence — training knowledge)
- Type shape of `AppSession = typeof auth.$Infer.Session` — pattern described in BA docs but exact field availability with `additionalFields` + admin plugin not independently verified in session
- Exact behavior of `disableSignUp: true` with server-side `auth.api.signUpEmail()` — inferred from BA docs architecture, not directly confirmed via test

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry
- Architecture (driver selection): HIGH — confirmed via two GitHub issues on the exact failure mode
- Better Auth admin plugin API: HIGH — verified via official docs
- Pitfalls: HIGH — neon-http issue confirmed via real GitHub issues; others from official docs
- Invite-only enforcement: MEDIUM — `disableSignUp` config is verified; exact server-side bypass behavior is ASSUMED

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (30 days — Better Auth and Neon change frequently; re-verify driver guidance before implementation if > 2 weeks elapse)

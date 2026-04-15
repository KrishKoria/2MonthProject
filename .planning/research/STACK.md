# Stack Research: Better Auth + Neon Integration

**Researched:** 2026-04-15
**Sources:** Context7 (better-auth/better-auth, drizzle-team/drizzle-orm-docs) — HIGH confidence
**Versions confirmed:** better-auth@1.3.4 (latest stable tagged in Context7), drizzle-orm@0.44.2, drizzle-kit@0.31.5

---

## Better Auth Setup

### Core auth.ts configuration (recommended pattern)

```typescript
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db"; // drizzle instance — see connection section

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  // Email/password: enabled but signup disabled — admin creates users
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,          // blocks POST /sign-up/email entirely
  },

  // Google + Microsoft social providers
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      disableImplicitSignUp: true, // social login only for existing accounts
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: "common",          // accepts personal + org accounts
      disableImplicitSignUp: true,
    },
  },

  // Same-email trusted account linking (Google ↔ Microsoft ↔ email-password)
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "microsoft", "email-password"],
      allowDifferentEmails: false,
    },
  },

  // Admin plugin: adds role, banned, banReason, banExpires to user table
  // and impersonatedBy to session table
  plugins: [
    admin({
      defaultRole: "reviewer",         // project-specific default
      adminRoles: ["admin"],           // which role values are admin-privileged
    }),
  ],
});
```

### Route handler (App Router)

File: `src/app/api/auth/[...all]/route.ts`

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Auth client (browser / client components)

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient()],
});
```

### Next.js 16 middleware (whole-app protection)

Better Auth docs have an explicit "Next.js 16+" section. Two options confirmed:

**Option A — full DB validation (Node.js runtime, more secure):**
```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",   // required for auth.api calls in Next.js 16
  matcher: ["/((?!api/auth|sign-in|accept-invite|bootstrap).*)"],
};
```

**Option B — cookie-only check (edge-compatible, faster, not a security boundary):**
```typescript
import { getSessionCookie } from "better-auth/cookies";
// use for optimistic redirects only; always re-validate in page/route handlers
```

Recommendation: Use Option A for this project. The matcher excludes `/api/auth/*`, `/sign-in`, `/accept-invite`, `/bootstrap` as required by AUTH-05.

### Server-side session check (server components / route handlers)

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/sign-in");
// session.user.role is available (added by admin plugin)
```

### Invite-only user creation (no public signup)

Two layers:
1. `emailAndPassword.disableSignUp: true` — blocks direct POST /sign-up/email
2. `disableImplicitSignUp: true` on each social provider — blocks auto-account-creation via OAuth

Admin creates users via:
```typescript
await authClient.admin.createUser({
  email: "newuser@company.com",
  name: "Jane Doe",
  password: crypto.randomUUID(), // temp password; user resets on first login
  role: "reviewer",              // or "senior_reviewer" or "admin"
});
```

### Deactivation + immediate session revocation (ACCESS-04)

The admin plugin `banUser` call revokes all existing sessions atomically:

```typescript
// Deactivate user (blocks login + kills all sessions)
await authClient.admin.banUser({ userId, banReason: "deactivated" });

// Reactivate user
await authClient.admin.unbanUser({ userId });
```

The `banned` field on the user record prevents new sessions. The revocation of existing sessions is confirmed as part of the `banUser` operation in the docs.

### Custom roles: reviewer / senior_reviewer / admin

The admin plugin stores `role` as a string column on the user table. Multi-role is stored comma-separated but this project uses single role. Configure:

```typescript
admin({
  defaultRole: "reviewer",
  adminRoles: ["admin", "senior_reviewer"], // roles that can use admin API
})
```

IMPORTANT: `adminRoles` controls which roles can call `authClient.admin.*` APIs. If senior_reviewer should NOT have admin plugin API access (only review-workflow authority), keep `adminRoles: ["admin"]`. The `role` string is still available on `session.user.role` for custom UI/backend gating regardless.

---

## Drizzle + Neon Connection

### The Transaction Constraint — Critical Decision

Neon offers two connection methods with different transaction support:

| Driver | Module | Transactions | Notes |
|--------|--------|-------------|-------|
| `neon-http` | `drizzle-orm/neon-http` | Non-interactive only (batch) | Fastest for single queries |
| `neon-serverless` | `drizzle-orm/neon-serverless` | Full interactive transactions | WebSocket-based |
| `node-postgres` | `drizzle-orm/node-postgres` | Full interactive transactions | TCP, not edge-compatible |

**Better Auth requires interactive transaction support** (the drizzle adapter's `transaction` field). The HTTP driver does NOT support interactive transactions. 

Recommendation: Use `@neondatabase/serverless` with the WebSocket Pool (`drizzle-orm/neon-serverless`) for the Drizzle instance passed to `drizzleAdapter`. This is Neon's serverless-native approach and supports full transactions.

### db.ts — Drizzle instance for better-auth + app queries

```typescript
// src/db/index.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws"; // bun: install ws @types/ws

// Required for Node.js runtime (Next.js route handlers run in Node)
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle({ client: pool });
```

Use `DATABASE_URL` set to Neon's **pooled connection string** (the `-pooler.neon.tech` hostname). This goes through PgBouncer in transaction mode, which is correct for serverless.

Note: Neon's pooled connection is in **transaction mode** (not session mode) — this means per-request connections but no prepared statements or advisory locks. Better Auth's drizzle adapter does not use prepared statements or advisory locks, so this is safe.

### drizzle-kit migration config

File: `drizzle.config.ts` (at frontend root):

```typescript
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Prevent drizzle-kit from touching Neon-managed roles
  entities: {
    roles: {
      provider: "neon",
    },
  },
});
```

The `entities.roles.provider: "neon"` option prevents drizzle-kit from conflicting with Neon's internal role management — confirmed in drizzle docs.

For drizzle-kit migration, use the **non-pooled** connection string (direct TCP, not `-pooler`). Migrations require a persistent connection. Add a separate env var:

```
DATABASE_URL=postgres://...@ep-xxx-pooler.neon.tech/neondb?sslmode=require      # runtime (pooled)
DATABASE_URL_UNPOOLED=postgres://...@ep-xxx.neon.tech/neondb?sslmode=require     # migrations only
```

Update drizzle.config.ts for migrations: `url: process.env.DATABASE_URL_UNPOOLED!`

### Schema generation workflow

Two-step process:

**Step 1 — Generate Better Auth tables (including plugin additions):**
```bash
bunx auth@latest generate --output src/db/schema/auth.ts
```

This generates the Drizzle schema for: `user`, `session`, `account`, `verification` (core), plus admin plugin additions (`role`, `banned`, `banReason`, `banExpires` on user; `impersonatedBy` on session).

**Step 2 — Add custom app tables to the same schema, then generate migrations:**
```bash
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

### Merging Better Auth schema with custom tables

Pattern: keep auth tables in `src/db/schema/auth.ts` (generated), add custom tables in `src/db/schema/app.ts`, re-export both from `src/db/schema/index.ts`. Point `drizzle.config.ts` at the index.

```typescript
// src/db/schema/index.ts
export * from "./auth";    // better-auth generated tables
export * from "./app";     // review_events, case_comments, audit_log, etc.
```

Then pass the schema to the Drizzle instance for type-safe queries:
```typescript
import * as schema from "@/db/schema";
export const db = drizzle({ client: pool, schema });
```

And pass the schema to the adapter:
```typescript
database: drizzleAdapter(db, {
  provider: "pg",
  // schema mapping only needed if your table names differ from better-auth defaults
})
```

### Migration regeneration when plugins change

When adding a new Better Auth plugin (e.g., future 2FA plugin), run `bunx auth@latest generate` again to get the updated schema diff, then run `bunx drizzle-kit generate` to create a new migration file. Do NOT run `bunx auth@latest migrate` — use drizzle-kit exclusively so migration history stays in one place.

---

## Version Compatibility

### Package versions in scope

| Package | Version | Status |
|---------|---------|--------|
| `better-auth` | `^1.3.4` | Stable. 1.3.4 is the latest stable tag in Context7. v1_3_8 and v1_3_10_beta_6 exist as newer tags. |
| `drizzle-orm` | `^0.44.2` | Compatible. drizzle-kit@0.31.5 is the latest confirmed in Context7. |
| `drizzle-kit` | `^0.31.x` | drizzle-orm and drizzle-kit must be kept in sync — the docs state min version pairing. Use matching minors. |
| `@neondatabase/serverless` | latest | No version constraint from better-auth docs. |
| `pg` | `^8.14.1` | Only needed if using `drizzle-orm/node-postgres` instead of neon-serverless. With the neon-serverless approach, `pg` is NOT needed at runtime. |
| `ws` | latest | Required peer dep when using `@neondatabase/serverless` in Node.js runtime. |

### Compatibility notes

**better-auth@1.3.4 + drizzle-orm@0.44.2:** No known incompatibility. The `drizzleAdapter` API (`better-auth/adapters/drizzle`) is stable and unchanged across 1.x. The `provider: "pg"` option is unchanged.

**pg@^8.14.1 is unnecessary if using neon-serverless driver.** The `pg` package is only needed when using `drizzle-orm/node-postgres`. With `drizzle-orm/neon-serverless` + `@neondatabase/serverless`, you do NOT import from `pg`. Remove `pg` from package.json to avoid a phantom dependency — unless it ends up needed for drizzle-kit internals (drizzle-kit bundles its own drivers, so it does not use your app's `pg`).

**drizzle-kit 0.31.x + drizzle-orm 0.44.x:** The docs note that drizzle-orm 0.29+ requires drizzle-kit 0.20+. At 0.44.x orm / 0.31.x kit, they are well within a compatible pairing. No migration format changes required.

**better-auth admin plugin + custom roles:** The `role` field is a plain `text` column (not an enum). The admin plugin does not enforce role values at the DB level — validation is in application logic. This means adding `senior_reviewer` requires no schema migration; it's a string value. This is intentional and confirmed in docs.

**Session table `impersonatedBy` column:** The admin plugin adds this to the session table. It is nullable and not used by the app, but it will be present in the schema after `auth@latest generate`. Do not remove it — it is needed for the plugin to function.

**`disableImplicitSignUp` on social providers:** Confirmed stable in 1.x. It prevents auto-account-creation via OAuth for users not already in the DB. Combined with `accountLinking.trustedProviders`, it means: existing user with matching email can link Google/Microsoft to their account, but a new Google login for an unknown email is rejected.

**`account.accountLinking.trustedProviders`:** An `async (request) => [...]` function signature is also supported (confirmed in 1.3.4 docs), useful if you need dynamic allow-listing.

---

## Recommendations

### 1. Use neon-serverless (WebSocket) not neon-http for the Drizzle instance passed to Better Auth
**Confidence: HIGH**

The `neon-http` driver does not support interactive transactions. Better Auth's drizzle adapter requires transaction support for atomic operations (e.g., creating a user + account record together). Use `drizzle-orm/neon-serverless` with `@neondatabase/serverless`'s `Pool`. Set `neonConfig.webSocketConstructor = ws` in any Node.js (non-edge) context.

### 2. Two connection strings in .env — pooled for runtime, unpooled for drizzle-kit
**Confidence: HIGH**

Neon's pooler runs in transaction mode (PgBouncer), which is correct for serverless request handlers. But drizzle-kit migrations need a persistent session connection. Always use the direct (non-pooler) connection string in `drizzle.config.ts`. Name them `DATABASE_URL` (pooled, runtime) and `DATABASE_URL_UNPOOLED` (direct, migrations only).

### 3. Use `bunx auth@latest generate` to produce the Drizzle schema, then drizzle-kit exclusively for migrations
**Confidence: HIGH**

Never use `bunx auth@latest migrate` in this project. Better Auth's built-in migrate command bypasses drizzle-kit and won't update your migration history. The correct flow is: `auth@latest generate` → produces updated `schema.ts` → `drizzle-kit generate` → produces SQL migration file → `drizzle-kit migrate` → applies to Neon.

### 4. Admin plugin `adminRoles` should only include `["admin"]` unless senior_reviewer needs authClient.admin.* APIs
**Confidence: HIGH**

The `adminRoles` config controls API-level access to the admin plugin's HTTP endpoints. Review workflow authority (REVIEW-05/06) is enforced by custom application logic, not the admin plugin. Keep `adminRoles: ["admin"]` only. The `role` string on `session.user.role` is always available for custom gating regardless of this setting.

### 5. Do NOT add `pg` as a runtime dependency if using neon-serverless
**Confidence: MEDIUM**

The `pg@^8.14.1` listed in the plan may be a holdover from an earlier design. With `drizzle-orm/neon-serverless` + `@neondatabase/serverless`, `pg` is not imported at runtime. drizzle-kit bundles its own PG client for introspection. Remove or keep as devDependency-only.

### 6. `entities.roles.provider: "neon"` in drizzle.config.ts is mandatory
**Confidence: HIGH**

Without this, drizzle-kit will try to manage Neon-internal roles during `drizzle-kit push` or introspection, causing errors. This is a Neon-specific gotcha confirmed in drizzle docs.

### 7. Deactivation = banUser (not a custom `active` column)
**Confidence: HIGH**

The admin plugin's `banUser` / `unbanUser` exactly maps to the deactivate/reactivate requirement (ACCESS-04). It sets `banned: true` on the user record and revokes all active sessions atomically. No need to add a custom `isActive` column — use `banned` as the deactivated state. Ban reason can be set to `"deactivated"` to distinguish from real bans.

### 8. better-auth@1.3.4 is the correct target; avoid 1.3.8+ betas for now
**Confidence: MEDIUM**

Context7 shows `v1_3_8` and `v1_3_10_beta_6` exist. These are likely newer than the `^1.3.4` pinned in the plan. Since `^1.3.4` will resolve to the latest 1.3.x stable patch, confirm what `bun add better-auth@^1.3.4` resolves to before committing. If 1.3.8 is published as stable it will be installed; review its changelog before accepting. The APIs documented above (admin plugin, account linking, social providers, drizzle adapter) are all stable across 1.x.

---

## Installation

```bash
# Runtime dependencies
bun add better-auth @neondatabase/serverless drizzle-orm ws

# Dev dependencies  
bun add -d drizzle-kit @types/ws dotenv
```

Note: `pg` is NOT needed if using neon-serverless. `ws` is the WebSocket constructor for Node.js runtime.

---

## Environment Variables

```bash
# .env.local

# Neon pooled connection (runtime — Next.js route handlers)
DATABASE_URL="postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Neon direct connection (drizzle-kit migrations only)
DATABASE_URL_UNPOOLED="postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Better Auth secret (generate with: openssl rand -hex 32)
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Microsoft OAuth
MICROSOFT_CLIENT_ID="..."
MICROSOFT_CLIENT_SECRET="..."
```

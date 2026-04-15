# Better Auth Review Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Better Auth authentication, admin-managed access control, authenticated Next.js-to-FastAPI proxying, and append-only review history with reviewer/senior/admin authority enforcement.

**Architecture:** Keep authentication and user-management state in the Next.js app with Better Auth and a Neon-hosted Postgres database. Replace the current blind `/api/*` rewrite with authenticated Next.js route handlers that forward a minimal trusted identity envelope to FastAPI. Refactor the Python investigation model from single `human_decision` storage to append-only review events plus derived workflow/disposition metadata.

**Tech Stack:** Next.js 16, React 19, Better Auth, Neon Postgres, Google + Microsoft social login, FastAPI, Pydantic v2, Bun, pytest.

---

## File Map

### Frontend auth, storage, and guards

- Create: `frontend/src/db/client.ts`
- Create: `frontend/src/db/schema.ts`
- Create: `frontend/drizzle.config.ts`
- Create: `frontend/src/lib/auth.ts`
- Create: `frontend/src/lib/auth-client.ts`
- Create: `frontend/src/lib/auth-session.ts`
- Create: `frontend/src/lib/access-control.ts`
- Create: `frontend/src/lib/access-store.ts`
- Create: `frontend/src/lib/access-types.ts`
- Create: `frontend/src/lib/mailer.ts`
- Create: `frontend/src/lib/proxy-auth.ts`
- Create: `frontend/src/lib/backend-proxy.ts`
- Create: `frontend/src/lib/backend-proxy.test.ts`

### Frontend routes and UI

- Create: `frontend/src/app/api/auth/[...all]/route.ts`
- Create: `frontend/src/app/api/bootstrap/route.ts`
- Create: `frontend/src/app/api/admin/users/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/role/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/deactivate/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/reactivate/route.ts`
- Create: `frontend/src/app/api/admin/invitations/[inviteId]/resend/route.ts`
- Create: `frontend/src/app/api/admin/audit/route.ts`
- Create: `frontend/src/app/api/claims/route.ts`
- Create: `frontend/src/app/api/claims/[id]/route.ts`
- Create: `frontend/src/app/api/claims/[id]/investigate/route.ts`
- Create: `frontend/src/app/api/claims/[id]/investigation/route.ts`
- Create: `frontend/src/app/api/claims/[id]/investigation/status/route.ts`
- Create: `frontend/src/app/api/claims/[id]/comments/route.ts`
- Create: `frontend/src/app/api/analytics/overview/route.ts`
- Create: `frontend/src/app/api/analytics/model-performance/route.ts`
- Create: `frontend/src/app/api/ncci/[code1]/[code2]/route.ts`
- Create: `frontend/src/app/(auth)/sign-in/page.tsx`
- Create: `frontend/src/app/(auth)/accept-invite/page.tsx`
- Create: `frontend/src/app/(auth)/bootstrap/page.tsx`
- Create: `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/components/auth/SignInCard.tsx`
- Create: `frontend/src/components/auth/InviteAcceptanceForm.tsx`
- Create: `frontend/src/components/auth/BootstrapAdminForm.tsx`
- Create: `frontend/src/components/admin/UserTable.tsx`
- Create: `frontend/src/components/admin/InviteUserForm.tsx`
- Create: `frontend/src/components/admin/AdminAuditTable.tsx`
- Create: `frontend/src/components/investigation/ReviewHistory.tsx`
- Create: `frontend/src/components/investigation/CommentThread.tsx`
- Create: `frontend/middleware.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/claims/page.tsx`
- Modify: `frontend/src/app/claims/[id]/page.tsx`
- Modify: `frontend/src/components/investigation/HumanReviewDesk.tsx`
- Modify: `frontend/src/components/investigation/InvestigationConsole.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/experience-copy.ts`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/next.config.test.ts`
- Modify: `frontend/.env.example`
- Modify: `frontend/README.md`

### Backend auth enforcement and review state

- Create: `backend/app/api/auth.py`
- Create: `backend/app/domain/review_state.py`
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/api/routes/claims.py`
- Modify: `backend/app/api/routes/investigation.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/data/schemas/claims.py`
- Modify: `backend/app/data/schemas/investigation.py`
- Modify: `backend/app/data/loader.py`
- Create: `backend/tests/test_auth_proxy.py`
- Modify: `backend/tests/test_api.py`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

---

## Assumptions

- Use one Neon-hosted Postgres database for Better Auth plus custom invitation/audit tables.
- Use the Neon pooled connection string for `DATABASE_URL`.
- Use dedicated Neon branches for local development and test environments.
- Use a shared `INTERNAL_PROXY_SECRET` between Next.js and FastAPI.
- Keep current browser paths (`/api/claims`, `/api/analytics`, etc.) stable by replacing rewrites with route handlers, not by changing callers.
- Preserve backward compatibility temporarily by mapping legacy terminal `claim_status` values into new `workflow_status` and `final_disposition` fields while migrating UI and API consumers.

---

## Tasks

### Task 1: Build the auth and access foundation in `frontend`

**Files:**
- Create: `frontend/src/db/client.ts`
- Create: `frontend/src/db/schema.ts`
- Create: `frontend/drizzle.config.ts`
- Create: `frontend/src/lib/auth.ts`
- Create: `frontend/src/lib/auth-client.ts`
- Create: `frontend/src/lib/auth-session.ts`
- Create: `frontend/src/lib/access-control.ts`
- Create: `frontend/src/lib/access-store.ts`
- Create: `frontend/src/lib/access-types.ts`
- Create: `frontend/src/lib/mailer.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add dependencies**

Add these packages in `frontend/package.json`:

```json
{
  "dependencies": {
    "better-auth": "^1.3.4",
    "drizzle-orm": "^0.44.2",
    "pg": "^8.14.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.4"
  }
}
```

- [ ] **Step 2: Create the Postgres and schema layer**

Use `frontend/src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

Use `frontend/src/db/schema.ts` for:
- invitations
- access audit events

- [ ] **Step 3: Configure Better Auth**

Use `frontend/src/lib/auth.ts` to enable:
- email/password
- Google social login
- Microsoft social login
- admin plugin
- same-email trusted account linking only
- Drizzle adapter with `provider: "pg"`

Core config shape:

```ts
database: drizzleAdapter(db, { provider: "pg" }),
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ["google", "microsoft", "email-password"],
    allowDifferentEmails: false,
  },
}
```

- [ ] **Step 4: Implement role and session helpers**

`frontend/src/lib/access-control.ts` should centralize:

```ts
export type AppRole = "reviewer" | "senior_reviewer" | "admin";
export function canResolveEscalation(role: AppRole) { ... }
export function canAccessAdmin(role: AppRole) { ... }
```

`frontend/src/lib/auth-session.ts` should expose:
- `requireSession()`
- `requireAdminSession()`
- `getOptionalSession()`

- [ ] **Step 5: Add env configuration**

Extend `frontend/.env.example` with:

```env
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<database>?sslmode=require
DATABASE_URL_TEST=postgresql://<user>:<password>@<neon-test-branch>/<database>?sslmode=require
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://127.0.0.1:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MAIL_FROM=
MAIL_PROVIDER=console
INTERNAL_PROXY_SECRET=
```

- [ ] **Step 6: Verify**

Run:

```bash
cd frontend
bun install
bunx drizzle-kit generate
bun run lint
```

Expected:
- install succeeds
- Neon Postgres is reachable via `DATABASE_URL`
- migration files are generated
- lint passes

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/.env.example frontend/src/db frontend/src/lib/auth.ts frontend/src/lib/auth-client.ts frontend/src/lib/auth-session.ts frontend/src/lib/access-control.ts frontend/src/lib/access-store.ts frontend/src/lib/access-types.ts frontend/src/lib/mailer.ts frontend/drizzle.config.ts
git commit -m "feat: add better auth foundation"
```

### Task 2: Protect the app and replace the FastAPI rewrite with authenticated route handlers

**Files:**
- Create: `frontend/middleware.ts`
- Create: `frontend/src/lib/proxy-auth.ts`
- Create: `frontend/src/lib/backend-proxy.ts`
- Create: `frontend/src/lib/backend-proxy.test.ts`
- Create: `frontend/src/app/api/auth/[...all]/route.ts`
- Create: `frontend/src/app/api/bootstrap/route.ts`
- Create: `frontend/src/app/api/claims/route.ts`
- Create: `frontend/src/app/api/claims/[id]/route.ts`
- Create: `frontend/src/app/api/claims/[id]/investigate/route.ts`
- Create: `frontend/src/app/api/claims/[id]/investigation/route.ts`
- Create: `frontend/src/app/api/claims/[id]/investigation/status/route.ts`
- Create: `frontend/src/app/api/claims/[id]/comments/route.ts`
- Create: `frontend/src/app/api/analytics/overview/route.ts`
- Create: `frontend/src/app/api/analytics/model-performance/route.ts`
- Create: `frontend/src/app/api/ncci/[code1]/[code2]/route.ts`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/next.config.test.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/server-api.ts`

- [ ] **Step 1: Protect the whole app**

Create `frontend/middleware.ts` so only these remain public:
- `/sign-in`
- `/accept-invite`
- `/bootstrap`
- `/api/auth/*`
- `/api/bootstrap`

Everything else should require a session.

- [ ] **Step 2: Build the trusted identity envelope**

`frontend/src/lib/proxy-auth.ts`:

```ts
export function buildProxyHeaders(actor: {
  userId: string;
  email: string;
  role: string;
  displayName: string;
}) {
  return {
    "x-actor-user-id": actor.userId,
    "x-actor-email": actor.email,
    "x-actor-role": actor.role,
    "x-actor-display-name": actor.displayName,
    "x-internal-proxy-secret": process.env.INTERNAL_PROXY_SECRET!,
  };
}
```

- [ ] **Step 3: Build the shared backend proxy helper**

`frontend/src/lib/backend-proxy.ts` should:
- require session
- build minimal headers
- forward to `API_BASE_URL`
- preserve method/body/status

- [ ] **Step 4: Replace the rewrite**

Remove the `/api/:path*` rewrite from `frontend/next.config.ts`.

Replace it with concrete App Router route handlers that forward to FastAPI through `proxyToBackend()`.

- [ ] **Step 5: Keep current frontend callers stable**

Do not change browser callers away from `/api/...`.

Instead, make these Next handlers own the proxying:
- `/api/claims`
- `/api/claims/[id]`
- `/api/claims/[id]/investigate`
- `/api/claims/[id]/investigation`
- `/api/claims/[id]/investigation/status`
- `/api/claims/[id]/comments`
- `/api/analytics/*`
- `/api/ncci/*`

- [ ] **Step 6: Add tests**

`frontend/src/lib/backend-proxy.test.ts` should cover:
- secret required
- user id/email/role/name forwarded
- no full session payload forwarded

`frontend/next.config.test.ts` should stop asserting a FastAPI rewrite exists.

- [ ] **Step 7: Verify**

Run:

```bash
cd frontend
bun test
bun run lint
```

Expected:
- config tests pass
- proxy helper tests pass

- [ ] **Step 8: Commit**

```bash
git add frontend/middleware.ts frontend/src/lib/proxy-auth.ts frontend/src/lib/backend-proxy.ts frontend/src/lib/backend-proxy.test.ts frontend/src/app/api frontend/next.config.ts frontend/next.config.test.ts frontend/src/lib/api.ts frontend/src/lib/server-api.ts
git commit -m "feat: add authenticated next proxy layer"
```

### Task 3: Refactor FastAPI to enforce trusted proxy auth and append-only review state

**Files:**
- Create: `backend/app/api/auth.py`
- Create: `backend/app/domain/review_state.py`
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/api/routes/claims.py`
- Modify: `backend/app/api/routes/investigation.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/data/schemas/claims.py`
- Modify: `backend/app/data/schemas/investigation.py`
- Modify: `backend/app/data/loader.py`
- Create: `backend/tests/test_auth_proxy.py`
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Add trusted proxy actor parsing**

Create `backend/app/api/auth.py` with:

```py
class CurrentActor(BaseModel):
    user_id: str
    email: str
    role: str
    display_name: str
```

and a dependency that validates:
- `x-internal-proxy-secret`
- `x-actor-user-id`
- `x-actor-email`
- `x-actor-role`
- `x-actor-display-name`

- [ ] **Step 2: Add workflow/disposition split**

Update `backend/app/data/schemas/claims.py` so the API model carries:
- `workflow_status`: `pending_review | pending_senior_review | manual_review_required | closed`
- `final_disposition`: `accepted | rejected | null`

Keep a compatibility mapping for legacy `claim_status` data loaded from parquet.

- [ ] **Step 3: Replace `human_decision` with append-only structures**

Update `backend/app/data/schemas/investigation.py` with:
- `review_events[]`
- `case_comments[]`
- `requires_role_for_next_decision`
- `escalated_*` metadata
- `resolved_*` metadata

Representative shape:

```py
class ReviewEvent(BaseModel):
    event_type: str
    actor_user_id: str
    actor_display_name_snapshot: str
    actor_role_snapshot: str
    notes: str
    created_at: datetime
```

- [ ] **Step 4: Centralize decision rules**

Create `backend/app/domain/review_state.py` for:
- role checks
- append-only event creation
- append-only comment creation
- derivation of `workflow_status`, `final_disposition`, `requires_role_for_next_decision`

- [ ] **Step 5: Update FastAPI routes**

`backend/app/api/routes/investigation.py` must enforce:
- reviewer can accept/reject ordinary cases
- reviewer can escalate ordinary and `manual_review_required` cases
- reviewer cannot resolve `pending_senior_review`
- senior/admin can resolve `pending_senior_review`
- every decision requires non-empty notes
- comments remain allowed after close
- no decision events after final close

Add `POST /api/claims/{claim_id}/comments`.

- [ ] **Step 6: Update store persistence**

Modify `backend/app/data/loader.py` so persisted investigations round-trip:
- review events
- comments
- derived escalator/resolver metadata
- compatibility mapping from old records if present

- [ ] **Step 7: Write and run failing tests first**

Add tests for:
- missing or invalid proxy secret -> 401
- reviewer cannot resolve pending senior review
- senior/admin can resolve pending senior review
- append-only comments after resolution
- immutable final decisions

Run:

```bash
cd backend
.venv\Scripts\python.exe -m pytest -q tests/test_api.py tests/test_auth_proxy.py
```

Expected:
- new tests fail before implementation
- pass after implementation

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/auth.py backend/app/domain/review_state.py backend/app/api/dependencies.py backend/app/api/routes/claims.py backend/app/api/routes/investigation.py backend/app/config.py backend/app/main.py backend/app/data/schemas/claims.py backend/app/data/schemas/investigation.py backend/app/data/loader.py backend/tests/test_auth_proxy.py backend/tests/test_api.py
git commit -m "feat: enforce role-aware review workflow in fastapi"
```

### Task 4: Update the review UI to use workflow state, review history, and comments

**Files:**
- Create: `frontend/src/components/investigation/ReviewHistory.tsx`
- Create: `frontend/src/components/investigation/CommentThread.tsx`
- Modify: `frontend/src/components/investigation/HumanReviewDesk.tsx`
- Modify: `frontend/src/components/investigation/InvestigationConsole.tsx`
- Modify: `frontend/src/app/claims/[id]/page.tsx`
- Modify: `frontend/src/app/claims/page.tsx`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/experience-copy.ts`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Update shared frontend types**

Replace the single-decision model in `frontend/src/lib/types.ts` with:
- `workflow_status`
- `final_disposition`
- `requires_role_for_next_decision`
- `review_events[]`
- `case_comments[]`
- escalator/resolver metadata

- [ ] **Step 2: Add review history and comments components**

`ReviewHistory.tsx` should render:
- event type
- actor display name snapshot
- actor role snapshot
- timestamp
- notes

`CommentThread.tsx` should render:
- append-only comments
- composer for any operational role with case access

- [ ] **Step 3: Refactor `HumanReviewDesk`**

Update button behavior so:
- notes are required for every decision event
- reviewer sees read-only actions for `pending_senior_review`
- senior/admin can resolve escalated cases
- final closed case shows resolver metadata, not mutable controls

- [ ] **Step 4: Update copy and status badges**

Replace terminal `escalated` language with:
- `pending_senior_review`
- explicit resolver/escalator display
- clear distinction between workflow routing and final disposition

- [ ] **Step 5: Verify**

Run:

```bash
cd frontend
bun test
bun run lint
```

Expected:
- no stale `human_decision` assumptions
- UI tests pass with event-based data

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/investigation frontend/src/app/claims/[id]/page.tsx frontend/src/app/claims/page.tsx frontend/src/lib/types.ts frontend/src/lib/experience-copy.ts frontend/src/app/layout.tsx
git commit -m "feat: update claim review ui for hierarchy workflow"
```

### Task 5: Build the admin screens and finish docs and verification

**Files:**
- Create: `frontend/src/app/(auth)/sign-in/page.tsx`
- Create: `frontend/src/app/(auth)/accept-invite/page.tsx`
- Create: `frontend/src/app/(auth)/bootstrap/page.tsx`
- Create: `frontend/src/components/auth/SignInCard.tsx`
- Create: `frontend/src/components/auth/InviteAcceptanceForm.tsx`
- Create: `frontend/src/components/auth/BootstrapAdminForm.tsx`
- Create: `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/components/admin/UserTable.tsx`
- Create: `frontend/src/components/admin/InviteUserForm.tsx`
- Create: `frontend/src/components/admin/AdminAuditTable.tsx`
- Create: `frontend/src/app/api/admin/users/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/role/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/deactivate/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/reactivate/route.ts`
- Create: `frontend/src/app/api/admin/invitations/[inviteId]/resend/route.ts`
- Create: `frontend/src/app/api/admin/audit/route.ts`
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `backend/.env.example`

- [ ] **Step 1: Build auth entry pages**

Add:
- sign-in page with email/password, Google, Microsoft
- invite acceptance page
- one-time bootstrap page for first admin only

- [ ] **Step 2: Build the narrow admin page**

Admin page must support:
- list users
- invite user with role assignment at invite time
- change role
- deactivate/reactivate
- resend invite
- minimal append-only access audit feed

- [ ] **Step 3: Enforce admin-only admin routes**

Every admin page/API route must call `requireAdminSession()`.

- [ ] **Step 4: Update docs**

Document:
- Better Auth env vars
- `DATABASE_URL`
- `DATABASE_URL_TEST`
- Neon project connection string
- Neon pooled connection string / connection pooling expectation
- Neon branch strategy for dev/test
- migration command
- bootstrap flow
- invite flow
- Google/Microsoft provider setup
- shared `INTERNAL_PROXY_SECRET`

- [ ] **Step 5: Run final verification**

Run:

```bash
cd frontend
bun test
bun run lint

cd ..\backend
.venv\Scripts\python.exe -m pytest -q tests
```

Expected:
- frontend lint/tests pass
- backend tests pass
- no remaining runtime dependence on the old `/api/*` rewrite

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/(auth) frontend/src/components/auth frontend/src/app/admin frontend/src/components/admin frontend/src/app/api/admin frontend/README.md backend/README.md backend/.env.example
git commit -m "feat: add admin access console and auth entry flows"
```

---

## Self-Review

### Spec coverage

- Better Auth with Google, Microsoft, and email/password fallback: Tasks 1 and 5.
- Whole-app auth protection except auth/bootstrap: Task 2.
- Admin-managed users, invite flow, role assignment, deactivation/reactivation, and minimal audit view: Task 5.
- Trusted Next.js-to-FastAPI forwarding and backend auth enforcement: Tasks 2 and 3.
- Review hierarchy with reviewer, senior reviewer, admin: Tasks 3 and 4.
- Append-only review events/comments and immutable final decisions: Tasks 3 and 4.
- Persistent documentation of the design and rollout: this plan plus `docs/auth-hierarchy-review-workflow-decisions.md`.

### Placeholder scan

- No `TODO` or `TBD` placeholders remain.
- Each task names exact files, verification commands, and commit boundaries.

### Type consistency

- Roles are consistently `reviewer`, `senior_reviewer`, `admin`.
- Workflow statuses are consistently `pending_review`, `pending_senior_review`, `manual_review_required`, `closed`.
- Final dispositions are consistently `accepted`, `rejected`, or `null`.
- The forwarded identity envelope is consistently `user_id`, `email`, `role`, and `display_name`.

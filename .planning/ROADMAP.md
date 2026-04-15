# Roadmap: Claims Investigation Workbench — Milestone 1

## Overview

5 phases delivering Better Auth authentication, admin-managed access control, an authenticated Next.js-to-FastAPI proxy, and an append-only review history with role-enforced authority — transforming a no-auth workbench into a trusted, auditable claims adjudication system.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Auth Foundation** - Neon DB, Drizzle schema, Better Auth config, social login, session management, and deactivation/reactivation
- [ ] **Phase 2: Session Gating + Entry Pages** - proxy.ts middleware enforcing whole-app auth, public route exclusions, sign-in, invite acceptance, and bootstrap pages
- [ ] **Phase 3: Authenticated Proxy** - Replace blind Next.js rewrite with route handlers that forward a trusted identity envelope; FastAPI validates proxy secret and actor headers
- [ ] **Phase 4: Review Workflow Refactor** - Append-only review events, computed workflow/disposition state, JSON persistence, role-gated backend enforcement
- [ ] **Phase 5: Review UI + Admin Console** - ReviewHistory, CommentThread, HumanReviewDesk refactor, admin page, access audit feed

## Phase Details

### Phase 1: Auth Foundation
**Goal**: Users can authenticate via email/password, Google, or Microsoft — with sessions that persist, respect deactivation, and are tied to a Neon Postgres database via the Drizzle adapter.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-06, ACCESS-03, ACCESS-04
**Success Criteria** (what must be TRUE):
  1. A user invited by email can set up their account via a setup link and log in with email/password
  2. A user can log in with Google or Microsoft — only if the social account email matches an invited email (same-email trusted linking enforced)
  3. Authenticated session survives browser refresh and page navigation without re-login
  4. Deactivating a user immediately invalidates all active sessions; subsequent sign-in attempts are blocked
  5. Reactivating a user restores their previous role and allows fresh sign-in
**Plans**: 5 plans
Plans:
- [x] 01-01-PLAN.md — Wave 0: Test scaffold (auth.test.ts, auth-session.test.ts, deactivate route.test.ts)
- [x] 01-02-PLAN.md — Wave 1: Dependencies + Neon db client + Drizzle schema + drizzle.config + .env.example
- [x] 01-03-PLAN.md — Wave 1: Type contracts (AppRole, SessionUser, InviteRecord) + access-control predicates
- [x] 01-04-PLAN.md — Wave 2: Better Auth server instance + browser auth client + Resend mailer
- [x] 01-05-PLAN.md — Wave 3: Session helpers + BA route handler + admin deactivate/reactivate routes + migration checkpoint
**UI hint**: no

### Phase 2: Session Gating + Entry Pages
**Goal**: Every app route requires an authenticated session — unauthenticated users are redirected to sign-in, and the three public entry pages (sign-in, invite acceptance, bootstrap) are functional.
**Depends on**: Phase 1
**Requirements**: AUTH-04, ACCESS-07, GUARD-01, GUARD-02, GUARD-03, PAGE-01, PAGE-02, PAGE-03
**Success Criteria** (what must be TRUE):
  1. Navigating to any protected route without a session redirects to /sign-in (verified via proxy.ts middleware, not next.config rewrites)
  2. The sign-in page renders email/password, Google, and Microsoft login options
  3. An invited user can visit the accept-invite page, complete account setup (password or social link), and land in the app
  4. The bootstrap page allows the very first admin to create their account; the page becomes inaccessible once any admin exists
  5. A user who authenticates but has no assigned role sees an access-denied state rather than any operational page
  6. Admin-only routes (/admin, /api/admin/*) return 403 for non-admin roles
**Plans**: TBD
**UI hint**: yes

### Phase 3: Authenticated Proxy
**Goal**: Every browser request to /api/* is forwarded by a Next.js route handler that injects a trusted identity envelope; FastAPI rejects any request missing the proxy secret or actor headers.
**Depends on**: Phase 1
**Requirements**: GUARD-04
**Success Criteria** (what must be TRUE):
  1. All existing browser paths (/api/claims, /api/analytics, /api/ncci, etc.) continue to work without URL changes — only the forwarding mechanism changes
  2. FastAPI receives user_id, email, role, and display_name headers on every proxied request
  3. FastAPI rejects any request missing the shared INTERNAL_PROXY_SECRET with a 401 or 403 — direct browser access to FastAPI is blocked
  4. SSE streaming (investigation status) passes through correctly using `return fetch(proxyRequest)` — never awaiting the body
**Plans**: TBD
**UI hint**: no

### Phase 4: Review Workflow Refactor
**Goal**: The claim investigation model transitions from a single human_decision field to append-only review_events[] and case_comments[], with workflow_status, final_disposition, and requires_role_for_next_decision all derived from the event log and enforced by the backend.
**Depends on**: Phase 3
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05, REVIEW-06, REVIEW-07, REVIEW-08, REVIEW-09, STATE-01, STATE-02, STATE-03, STATE-04, STATE-05
**Success Criteria** (what must be TRUE):
  1. A reviewer can accept, reject, or escalate a pending_review or manual_review_required case — each action requires non-empty notes and appends an event; the reviewer cannot act on pending_senior_review cases
  2. A senior reviewer or admin can resolve (accept/reject) any escalated case with non-empty notes, appending a final decision event
  3. Once a case is closed, no further decision events can be added; final_disposition is immutable (backend enforces, not just UI)
  4. workflow_status, final_disposition, and requires_role_for_next_decision are computed from the event log using Pydantic @computed_field — no stored derived values
  5. Investigation history is stored as JSON (not Parquet); escalation metadata and resolution metadata are surfaced on the case object
**Plans**: TBD
**UI hint**: no

### Phase 5: Review UI + Admin Console
**Goal**: Users see a full review event log and comment thread on every case, the HumanReviewDesk enforces role-gated actions, the claims queue surfaces workflow state, and admins can manage all users and view the access audit feed.
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, ACCESS-01, ACCESS-02, ACCESS-05, ACCESS-06, ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. The ReviewHistory panel shows every event in order — event type, actor display name snapshot, actor role snapshot, timestamp, and notes
  2. The CommentThread panel shows all case comments with a working composer for any operational role; comments can be added to closed cases
  3. The HumanReviewDesk disables decision buttons until notes are non-empty, shows read-only "awaiting senior review" state for reviewers on escalated cases, and shows resolver metadata for closed cases
  4. The claims queue displays workflow_status and final_disposition columns so agents can filter by state
  5. The admin page lets an admin invite users (email + role), change roles, deactivate, reactivate, resend invites, and view the access audit feed (invited, role changed, deactivated, reactivated events)
**Plans**: TBD
**UI hint**: yes

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth Foundation | 5/5 | Complete | 2026-04-15 |
| 2. Session Gating + Entry Pages | 0/TBD | Not started | - |
| 3. Authenticated Proxy | 0/TBD | Not started | - |
| 4. Review Workflow Refactor | 0/TBD | Not started | - |
| 5. Review UI + Admin Console | 0/TBD | Not started | - |

---
*Created: 2026-04-15*
*Phase 1 planned: 2026-04-15*

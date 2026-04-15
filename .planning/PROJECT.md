# Claims Investigation Workbench

## What This Is

An internal claims-review platform for adjusters and senior reviewers to investigate, adjudicate, and audit insurance claims using AI-assisted analysis. The workbench combines a Next.js 16 / React 19 frontend with a FastAPI backend that runs a LangGraph orchestration pipeline — claims flow through automated triage, evidence gathering, and LLM rationale, then land in a human review queue where role-appropriate decisions are made and recorded.

## Core Value

Every claim decision must carry clear authority and an immutable audit trail — the right person makes each call, and that record never changes.

## Requirements

### Validated

- ✓ Claims queue with filtering and pagination — existing
- ✓ AI-driven investigation pipeline (triage → evidence → rationale) — existing
- ✓ SSE-streamed investigation console — existing
- ✓ Human review desk with accept/reject/escalate actions — existing
- ✓ Analytics and model-performance views — existing
- ✓ NCCI code lookup — existing

### Active

#### Milestone 1: Auth + Review Hierarchy

- [ ] **AUTH-01**: Better Auth foundation — Neon Postgres DB, Drizzle adapter, schema migrations
- [ ] **AUTH-02**: Email/password invite-setup login (no public self-signup)
- [ ] **AUTH-03**: Google and Microsoft social login with same-email trusted account linking
- [ ] **AUTH-04**: First-admin bootstrap flow (disabled once an admin exists)
- [ ] **AUTH-05**: Whole-app auth protection — public only: sign-in, accept-invite, bootstrap, `/api/auth/*`
- [ ] **ACCESS-01**: Single role per user — `reviewer`, `senior_reviewer`, `admin`
- [ ] **ACCESS-02**: Admin console — list users, invite with role, change role, deactivate/reactivate, resend invite
- [ ] **ACCESS-03**: Minimal access-management audit feed (invite, role change, deactivate, reactivate events)
- [ ] **ACCESS-04**: Immediate session revocation on deactivation; role restore on reactivation
- [ ] **PROXY-01**: Replace blind `/api/*` Next.js rewrite with authenticated route handlers forwarding a trusted identity envelope (`user_id`, `email`, `role`, `display_name`) to FastAPI
- [ ] **PROXY-02**: FastAPI validates shared `INTERNAL_PROXY_SECRET` and actor headers on every mutating request
- [ ] **REVIEW-01**: Replace single `human_decision` field with append-only `review_events[]` and `case_comments[]`
- [ ] **REVIEW-02**: Workflow status split — `pending_review`, `pending_senior_review`, `manual_review_required`, `closed`
- [ ] **REVIEW-03**: Final disposition split — `accepted`, `rejected`, `null`
- [ ] **REVIEW-04**: Derived field `requires_role_for_next_decision` drives UI gating and backend enforcement
- [ ] **REVIEW-05**: Reviewer can accept/reject/escalate ordinary and `manual_review_required` cases; cannot resolve `pending_senior_review`
- [ ] **REVIEW-06**: Senior reviewer and admin can resolve escalated cases
- [ ] **REVIEW-07**: Every decision event requires non-empty notes
- [ ] **REVIEW-08**: Comments are append-only and allowed on any case including closed ones
- [ ] **REVIEW-09**: Final disposition is immutable once set
- [ ] **REVIEW-10**: Audit snapshots — each event/comment records `actor_display_name_snapshot` and `actor_role_snapshot`
- [ ] **UI-01**: ReviewHistory component rendering event log with actor, role, timestamp, notes
- [ ] **UI-02**: CommentThread component with append-only composer
- [ ] **UI-03**: HumanReviewDesk respects workflow state — role-gated buttons, required notes, read-only view for escalated cases
- [ ] **UI-04**: Auth entry pages — sign-in, invite acceptance, bootstrap

### Out of Scope

- Public self-signup — admin-only account creation by design (decision 11)
- Multi-tenant org model — single internal organization (decision 1)
- Enterprise SSO plugin — Google + Microsoft social login covers v1 (decision 14)
- Send-back / de-escalation flow — escalated cases terminate in senior resolution (decision 21)
- Private or role-restricted comments — all case comments are shared (decision 35)
- Reopen / override flow — final disposition is immutable in v1 (decision 37)
- Notification system — deferred to future milestone
- Mobile app — web-first

## Context

**Existing codebase:** Dual-application monorepo. `frontend/` is a Next.js 16 App Router workbench; `backend/` is a FastAPI service with a LangGraph pipeline, an in-memory `DataStore`, XGBoost risk scoring, ChromaDB RAG, and SSE streaming. Claims data is loaded from parquet at startup.

**Current auth state:** No authentication. Next.js blindly rewrites `/api/*` to FastAPI. Any request reaches any endpoint.

**Current review state:** Investigation model stores a single `human_decision` object — no event log, no role enforcement, no audit trail.

**Neon Postgres:** Account and project already provisioned. Dev and test branches available. Connection pooling expected (serverless environment).

**Plan document:** `docs/superpowers/plans/2026-04-15-better-auth-review-hierarchy.md` — 5-task implementation plan with exact file lists, step-by-step instructions, and commit boundaries.

**Decision log:** `docs/auth-hierarchy-review-workflow-decisions.md` — 53 architectural decisions covering every design choice for auth, roles, review workflow, and audit.

**Open areas to resolve during planning:** Exact invite acceptance UX flow, FastAPI identity-header trust mechanism detail, event/comment schema field completeness, and role snapshot capture on comments.

## Constraints

- **Tech stack**: Next.js 16, React 19, Better Auth, Drizzle ORM, Neon Postgres, FastAPI, Pydantic v2, Bun, uv, pytest — no changes to core stack
- **Package manager**: Bun for frontend; uv for backend — no npm/pip
- **Auth boundary**: Better Auth lives entirely in Next.js; FastAPI trusts only the proxied identity envelope, never direct browser JWTs
- **Backward compat**: Browser callers stay on `/api/...` paths — only the proxy mechanism changes, not the URLs
- **Parquet data**: Claims data remains file-based (DataStore) in v1; Neon is auth + audit only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Better Auth in Next.js, proxy to FastAPI | Browser authenticates once; FastAPI remains auth-agnostic | — Pending |
| Single role per user | Simplicity; no compound-role edge cases | — Pending |
| Neon Postgres for auth/audit | Serverless-compatible, branching for dev/test | — Pending |
| Append-only review events + derived state | Immutable audit trail; UI/backend derive current state from same source | — Pending |
| Workflow status ≠ final disposition | Keeps routing logic separate from business outcome | — Pending |
| No public self-signup | Internal tool; admin controls who gets access | — Pending |
| Admin can resolve escalations | Admin is an operational role, not management-only | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after initialization*

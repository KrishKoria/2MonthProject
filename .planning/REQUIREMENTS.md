# Requirements: Claims Investigation Workbench — Milestone 1

**Defined:** 2026-04-15
**Core Value:** Every claim decision must carry clear authority and an immutable audit trail — the right person makes each call, and that record never changes.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can log in with email and a setup link (invite-only, no public signup)
- [x] **AUTH-02**: User can log in with Google social login — only if their Google account email matches an invited email
- [x] **AUTH-03**: User can log in with Microsoft social login — only if their Microsoft account email matches an invited email
- [ ] **AUTH-04**: First admin can bootstrap the system via a one-time bootstrap page that disables itself once an admin exists
- [x] **AUTH-05**: Authenticated session persists across browser refresh and page navigation
- [x] **AUTH-06**: Deactivated user sessions are revoked immediately — future sign-in attempts are blocked

### Access Control

- [ ] **ACCESS-01**: Admin can invite a new user (email + role assigned at invite time); invited user receives an account setup link
- [ ] **ACCESS-02**: Admin can change a user's role (`reviewer`, `senior_reviewer`, `admin`)
- [x] **ACCESS-03**: Admin can deactivate a user — all active sessions revoked immediately
- [x] **ACCESS-04**: Admin can reactivate a user — previous role restored, fresh sign-in required
- [ ] **ACCESS-05**: Admin can resend an invite to a pending user
- [ ] **ACCESS-06**: Admin can view an access-management audit feed (invite sent, role changed, deactivated, reactivated events)
- [ ] **ACCESS-07**: User with no assigned role sees an access-denied state after sign-in

### App Protection

- [ ] **GUARD-01**: All app routes require an authenticated session — unauthenticated requests redirect to sign-in
- [ ] **GUARD-02**: Public routes are exactly: sign-in, accept-invite, bootstrap, `/api/auth/*` — everything else is protected
- [ ] **GUARD-03**: Admin-only routes (`/admin`, `/api/admin/*`) return 403 for non-admin roles
- [ ] **GUARD-04**: Next.js proxy forwards a trusted identity envelope (`user_id`, `email`, `role`, `display_name`) to FastAPI on every request; FastAPI rejects requests missing the shared proxy secret

### Review Workflow

- [ ] **REVIEW-01**: Reviewer can accept an ordinary (`pending_review`) or `manual_review_required` case with required non-empty notes
- [ ] **REVIEW-02**: Reviewer can reject an ordinary (`pending_review`) or `manual_review_required` case with required non-empty notes
- [ ] **REVIEW-03**: Reviewer can escalate any case to senior review (`pending_senior_review`) with required non-empty notes
- [ ] **REVIEW-04**: Reviewer cannot make a decision on a `pending_senior_review` case — action buttons are read-only
- [ ] **REVIEW-05**: Senior reviewer or admin can accept or reject a `pending_senior_review` case with required non-empty notes
- [ ] **REVIEW-06**: Senior reviewer can accept or reject any case (operational superset of reviewer)
- [ ] **REVIEW-07**: Once a case is closed, no further decision events can be added — final disposition is immutable
- [ ] **REVIEW-08**: Any operational role (reviewer, senior reviewer, admin) can add append-only comments to any case they can view, including closed cases
- [ ] **REVIEW-09**: Each review event and comment records the actor's display name and role at the time of writing — snapshots survive future profile changes

### Review State Model

- [ ] **STATE-01**: Every claim carries a `workflow_status` (`pending_review`, `pending_senior_review`, `manual_review_required`, `closed`) derived from the event log
- [ ] **STATE-02**: Every claim carries a `final_disposition` (`accepted`, `rejected`, or null) derived from the event log
- [ ] **STATE-03**: Every claim carries a `requires_role_for_next_decision` field (`reviewer`, `senior_reviewer`, `none`) that drives both backend enforcement and UI rendering
- [ ] **STATE-04**: Investigation history is stored as append-only `review_events[]` and `case_comments[]` — no in-place edits
- [ ] **STATE-05**: Escalation metadata (`escalated_at`, `escalated_by_*`) and resolution metadata (`resolved_at`, `resolved_by_*`, `final_disposition`) are derived and surfaced for quick context

### Review UI

- [ ] **UI-01**: Review history panel shows full event log — event type, actor name snapshot, actor role snapshot, timestamp, notes
- [ ] **UI-02**: Comment thread panel shows all case comments with a composer for any operational role with case access
- [ ] **UI-03**: HumanReviewDesk disables decision buttons until notes field is non-empty
- [ ] **UI-04**: HumanReviewDesk shows read-only "awaiting senior review" state for `pending_senior_review` cases when the actor is a reviewer
- [ ] **UI-05**: HumanReviewDesk shows resolver metadata (who closed it, when, under what role) for closed cases
- [ ] **UI-06**: Claims queue surface `workflow_status` and `final_disposition` so agents can filter by state

### Auth Entry Pages

- [ ] **PAGE-01**: Sign-in page supports email/password, Google, and Microsoft login
- [ ] **PAGE-02**: Invite acceptance page lets invited users set up their account (password or social link)
- [ ] **PAGE-03**: Bootstrap page lets the first admin create their account — page disables after any admin exists

### Admin Console

- [ ] **ADMIN-01**: Admin page lists all users with their role, status (active/invited/deactivated), and last login
- [ ] **ADMIN-02**: Admin page shows invite form (email + role selection) and sends the invite
- [ ] **ADMIN-03**: Admin page allows role changes, deactivation, reactivation, and invite resend per user
- [ ] **ADMIN-04**: Admin page shows access-management audit feed with minimum events: invited, role changed, deactivated, reactivated

## v2 Requirements

### Notifications

- **NOTF-01**: User receives email when they are invited
- **NOTF-02**: User receives email when their role changes
- **NOTF-03**: User receives in-app notification when a case they escalated is resolved

### Advanced Auth

- **ADV-01**: Enterprise SSO / SAML integration
- **ADV-02**: Two-factor authentication (TOTP)

### Review Enhancements

- **REV-V2-01**: Senior reviewer can send a case back to reviewer (de-escalation)
- **REV-V2-02**: Admin can override and reopen a closed case
- **REV-V2-03**: Structured escalation taxonomy (enum reasons) instead of free-text only
- **REV-V2-04**: Role-restricted comment visibility

## Out of Scope

| Feature | Reason |
|---------|--------|
| Public self-signup | Internal tool — admin controls all account creation (decision 11) |
| Multi-tenant org model | Single internal organization; org plugin would add complexity without benefit (decision 1) |
| Enterprise SSO plugin | Google + Microsoft covers v1; full SAML deferred (decision 14) |
| Send-back / de-escalation flow | Escalated cases terminate in senior resolution in v1 (decision 21) |
| Private or role-restricted comments | All case comments shared in v1 (decision 35) |
| Reopen / override final disposition | Final disposition immutable in v1 (decision 37) |
| Notification system | No email or in-app notifications in v1 — deferred |
| Mobile app | Web-first; mobile deferred |
| Real-time case locking | Not needed for v1 scale |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 1 | Complete |
| AUTH-06 | Phase 1 | Complete |
| ACCESS-01 | Phase 5 | Pending |
| ACCESS-02 | Phase 5 | Pending |
| ACCESS-03 | Phase 1 | Complete |
| ACCESS-04 | Phase 1 | Complete |
| ACCESS-05 | Phase 5 | Pending |
| ACCESS-06 | Phase 5 | Pending |
| ACCESS-07 | Phase 2 | Pending |
| GUARD-01 | Phase 2 | Pending |
| GUARD-02 | Phase 2 | Pending |
| GUARD-03 | Phase 2 | Pending |
| GUARD-04 | Phase 3 | Pending |
| REVIEW-01 | Phase 4 | Pending |
| REVIEW-02 | Phase 4 | Pending |
| REVIEW-03 | Phase 4 | Pending |
| REVIEW-04 | Phase 4 | Pending |
| REVIEW-05 | Phase 4 | Pending |
| REVIEW-06 | Phase 4 | Pending |
| REVIEW-07 | Phase 4 | Pending |
| REVIEW-08 | Phase 4 | Pending |
| REVIEW-09 | Phase 4 | Pending |
| STATE-01 | Phase 4 | Pending |
| STATE-02 | Phase 4 | Pending |
| STATE-03 | Phase 4 | Pending |
| STATE-04 | Phase 4 | Pending |
| STATE-05 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 5 | Pending |
| PAGE-01 | Phase 2 | Pending |
| PAGE-02 | Phase 2 | Pending |
| PAGE-03 | Phase 2 | Pending |
| ADMIN-01 | Phase 5 | Pending |
| ADMIN-02 | Phase 5 | Pending |
| ADMIN-03 | Phase 5 | Pending |
| ADMIN-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after initial definition*

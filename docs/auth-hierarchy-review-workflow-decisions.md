# Auth, Roles, And Review Workflow Decisions

Date: 2026-04-15
Context: Better Auth adoption for internal claims-review hierarchy, escalation routing, and auditability.

## Current Decisions

1. Tenant model
   - Decision: Single internal organization, not multi-tenant.
   - Implication: Do not adopt Better Auth organization plugin in v1 just to model hierarchy.

2. Meaning of escalation
   - Decision: Escalation is a handoff state, not a final business outcome.
   - Implication: A reviewer escalates into a senior-review lane instead of closing the claim.

3. Reviewer authority
   - Decision: Reviewer can finalize ordinary cases.
   - Implication: Only escalated cases require senior resolution.

4. Ownership after escalation
   - Decision: Ownership transfers on escalation.
   - Implication: Original reviewer can still view and comment, but cannot resolve or reverse the case.

5. Historical record
   - Decision: Keep full decision history.
   - Implication: A single latest `human_decision` field is insufficient.

6. Escalation destination
   - Decision: General senior-review queue.
   - Implication: No specific assignee workflow in v1.

7. Enforcement boundary
   - Decision: Backend enforces authorization.
   - Implication: UI gating alone is not acceptable for state-changing operations.

8. Frontend-backend auth boundary
   - Decision: Next.js server proxy first.
   - Implication: Better Auth lives in the frontend app, which proxies trusted identity to FastAPI.

9. Role cardinality
   - Decision: Single role per user.
   - Roles: `reviewer`, `senior_reviewer`, `admin`.

10. Admin operational authority
    - Decision: Admin can resolve escalations.
    - Implication: Admin is not management-only.

11. Account lifecycle
    - Decision: Admin-created or admin-invited accounts only.
    - Implication: No public self-signup.

12. User management scope
    - Decision: Build user management now.
    - Implication: This feature includes real account lifecycle support, not only seeded demo users.

13. User onboarding method
    - Decision: Invite/setup by email.
    - Implication: Avoid admin-issued permanent passwords.

14. Authentication methods
    - Decision: Add social login now.
    - Choice: Microsoft and Google social login first.
    - Implication: Do not start with the full enterprise SSO plugin.

15. Invite-to-social identity binding
    - Decision: Invited email must match the social-login email.
    - Implication: No arbitrary social-account linking for privileged access.

16. Role-less access
    - Decision: No role, no access.
    - Implication: Invitation acceptance or successful auth alone does not grant app access.

17. Admin UX scope
    - Decision: Narrow admin page.
    - Minimum scope: list users, invite user, view invitation/account state, assign/change role, deactivate user, optionally resend invite.

18. Deactivation and auditability
    - Decision: Keep historical attribution after deactivation.
    - Implication: Prior review activity remains visible and attributable.

19. Note model
    - Decision: Split decision events and case comments.
    - Implication: Non-decision collaboration continues after escalation without restoring decision authority.

20. Senior reviewer scope
    - Decision: Senior reviewers can handle any case.
    - Implication: Senior reviewer is an operational superset of reviewer, while escalation resolution remains exclusive to senior/admin.

21. Escalation return flow
    - Decision: No send-back flow in v1.
    - Implication: Escalated cases terminate in final senior resolution.

22. Escalation trigger
    - Decision: Human-triggered escalation only.
    - Implication: Keep hierarchy routing separate from `manual_review_required`.

23. State-model separation
    - Decision: Split workflow status and final disposition.
    - Recommended direction:
      - `workflow_status`: `pending_review`, `pending_senior_review`, `manual_review_required`, `closed`
      - `final_disposition`: `accepted`, `rejected`, `null`

24. Review record structure
    - Decision: Replace single `human_decision` with append-only review events plus derived current state.

25. Comment mutability
    - Decision: Comments are append-only.
    - Implication: Corrections are new comments, not in-place edits.

26. Social account linking
    - Decision: Auto-link same-email trusted providers.
    - Recommended Better Auth direction:
      - `account.accountLinking.enabled = true`
      - `trustedProviders = ["google", "microsoft", "email-password"]`
      - `allowDifferentEmails = false`
    - Implication: Same-email Google/Microsoft sign-in can attach to the invited account automatically, but different-email linking is not allowed.

27. First-login activation
    - Decision: Immediate activation after matched sign-in.
    - Activation preconditions:
      - invited email exists
      - provider email matches exactly
      - assigned role exists
      - account is not deactivated
    - Implication: No extra admin approval step after the first successful matched login.

28. Duplicate invite behavior
    - Decision: Update existing same-email user.
    - Recommended behavior:
      - Same email updates the existing identity/access record instead of creating a second user
      - Admin may resend invite/setup email
      - Deactivated users can be explicitly reactivated or re-invited
    - Implication: One account per person/email, preserving audit continuity.

29. Invitation lifecycle
    - Decision: Expire invites and invalidate older pending ones on re-invite.
    - Recommended v1 rule:
      - invitation expires after 7 days
      - re-invite cancels the previous pending invite for that email
      - only the most recent invite remains usable
    - Implication: Clean onboarding state with a single valid activation path per email.

30. Deactivation enforcement
    - Decision: Immediate session revocation on deactivation.
    - Recommended behavior:
      - mark account deactivated
      - revoke all active sessions immediately
      - block future sign-in
      - preserve historical attribution
    - Implication: Access loss takes effect immediately, not only on the next login.

31. Reactivation behavior
    - Decision: Restore previous role automatically.
    - Recommended behavior:
      - reactivate account
      - restore prior assigned role by default
      - require fresh login
      - do not revive old sessions
      - allow admin to change role during reactivation if needed
    - Implication: Reactivation restores access consistently without requiring separate role repair.

32. Audit snapshots
    - Decision: Snapshot display name and role on each event/comment.
    - Recommended event/comment fields:
      - `actor_user_id`
      - `actor_display_name_snapshot`
      - `actor_role_snapshot`
      - `created_at`
      - `notes`
    - Implication: Historical records remain accurate even if user profile data changes later.

33. Escalation-derived metadata
    - Decision: Derive and display original escalator in current case state.
    - Recommended derived fields:
      - `escalated_at`
      - `escalated_by_user_id`
      - `escalated_by_name_snapshot`
      - `escalated_by_role_snapshot`
    - Implication: Major handoff context is visible without reading the full event log.

34. Resolution-derived metadata
    - Decision: Derive and display final resolver.
    - Recommended derived fields:
      - `resolved_at`
      - `resolved_by_user_id`
      - `resolved_by_name_snapshot`
      - `resolved_by_role_snapshot`
      - `final_disposition`
    - Implication: Current case state clearly shows who closed the case and under what authority.

35. Comment visibility
    - Decision: All case comments are shared.
    - Recommended v1 rule:
      - anyone with case access can read all comments
      - authorized actors can add comments
      - no private or role-restricted comment types in v1
    - Implication: Handoffs remain transparent without introducing a second comment-permission system.

36. Post-resolution comments
    - Decision: Allow comments after resolution.
    - Recommended v1 rule:
      - final decision events are locked after resolution
      - append-only comments remain allowed for users with case access
      - UI clearly marks the case as closed
    - Implication: Business outcomes remain stable while audit/context discussion can continue.

37. Final disposition mutability
    - Decision: Final decisions are immutable in v1.
    - Recommended v1 rule:
      - once `final_disposition` is set, no further decision events are allowed
      - comments may still be added
      - reopen/override flow is deferred
    - Implication: The state machine remains simple and auditable.

38. Queue visibility
    - Decision: All operational roles can view the full queue.
    - Recommended access model:
      - reviewer can view all cases
      - senior reviewer can view all cases
      - admin can view all cases
      - actions remain constrained by role and current workflow state
    - Implication: Visibility is broad, but authority is enforced on actions.

39. Escalated-case detail access
    - Decision: Reviewers keep read-only detail access.
    - Recommended v1 rule:
      - reviewers can open escalated case details
      - reviewers cannot create decision events on escalated cases
      - reviewers can add shared case comments
      - senior reviewer and admin retain decision authority
    - Implication: Ownership transfer does not hide the case from the original operational audience.

40. Comment permissions
    - Decision: Any operational role with access can comment.
    - Recommended v1 rule:
      - reviewer, senior reviewer, and admin can comment on any case they can view
      - decision-event authority remains governed separately by role and workflow state
    - Implication: Collaboration stays open while outcome control stays restricted.

41. Required-role derived field
    - Decision: Add explicit required-role derived field.
    - Recommended field:
      - `requires_role_for_next_decision`: `reviewer` | `senior_reviewer` | `none`
    - Example interpretation:
      - ordinary open case: `reviewer`
      - escalated case: `senior_reviewer`
      - closed case: `none`
    - Implication: UI and backend can enforce authority from a single derived source instead of scattered inference.

42. Escalation rationale format
    - Decision: Free-text escalation reason only.
    - Recommended v1 rule:
      - escalation decision requires non-empty notes
      - no structured escalation taxonomy yet
      - senior reviewer reads escalation rationale from the review event log and comments
    - Implication: Audit context is captured without committing to a premature enum model.

43. Decision note requirements
    - Decision: Require notes for all decision events.
    - Recommended v1 rule:
      - `accepted` requires non-empty notes
      - `rejected` requires non-empty notes
      - `escalated` requires non-empty notes
      - case comments remain separate and optional
    - Implication: Every disposition event carries explicit rationale instead of becoming a bare button click.

44. `manual_review_required` authority
    - Decision: Reviewer can resolve `manual_review_required` cases.
    - Clarification: No gray-area exception in v1.
    - Recommended v1 rule:
      - `manual_review_required` does not imply senior-review authority
      - reviewer may resolve it directly
      - reviewer may still explicitly escalate if they want senior input
    - Implication: System-driven evidence insufficiency remains separate from hierarchy routing.

45. Admin audit scope
    - Decision: Add minimal admin audit view.
    - Minimum audit events to surface:
      - user invited
      - invite resent
      - invite expired
      - role assigned or changed
      - user deactivated
      - user reactivated
    - Implication: Access-management actions remain inspectable without building a full audit console.

46. First-admin bootstrap
    - Decision: One-time bootstrap flow for first admin.
    - Recommended v1 behavior:
      - if no admin exists, allow bootstrap creation of the first admin
      - once an admin exists, disable the bootstrap route
      - all subsequent users must come through admin-managed invite/create flow
    - Implication: Initial setup is practical without leaving a permanent privilege-escalation path open.

47. Social provider scope
    - Decision: Both Microsoft and Google are mandatory in v1.
    - Clarification: Better Auth provider interfaces are consistent enough that both should be enabled from the start.
    - Implication: The auth implementation must support invite-matched email/password, Google, and Microsoft without deferring either social provider.

48. Route protection boundary
    - Decision: Protect the whole app except auth/bootstrap routes.
    - Public routes:
      - sign-in
      - invite acceptance or password setup
      - OAuth callbacks
      - first-admin bootstrap, only while no admin exists
    - Protected routes:
      - dashboard
      - claims queue
      - claim detail
      - admin page
      - internal app APIs
    - Implication: The app is treated as an authenticated internal system by default.

49. Backend identity forwarding model
    - Decision: Forward minimal trusted identity envelope.
    - Recommended forwarded fields:
      - `user_id`
      - `email`
      - `role`
      - `display_name`
    - Implication: FastAPI receives only the identity data required for authorization and audit writes, not the full Better Auth session payload.

50. Admin page authorization
    - Decision: Admin page is admin-only.
    - Recommended v1 rule:
      - only `admin` can access user management, invitation management, and admin audit views
      - `senior_reviewer` remains an operational claims role, not an access-management role
    - Implication: Claim authority and account authority remain cleanly separated.

51. Invite-time role assignment
    - Decision: Assign role at invite time.
    - Implication: Activation can remain deterministic because the invited identity already carries explicit authority before first login.

52. Access-management audit immutability
    - Decision: Access-management audit events are append-only and permanent.
    - Implication: Admin-side identity and role changes remain historically inspectable without redaction in v1.

53. Auth/access database
    - Decision: Use Neon-hosted Postgres, not SQLite.
    - Implication: Better Auth, invitations, and access-management audit data should use a Postgres-backed adapter and migrations from the start, with environment and deployment assumptions aligned to Neon.
    - Operational note: Use Neon connection pooling rather than assuming long-lived direct connections.
    - Local/dev note: Use dedicated Neon branches for development and testing instead of introducing a separate local SQLite/Postgres fallback.

## Recommended Derived Model

- Auth provider
  - Better Auth in Next.js
  - Email/password invite/setup
  - Google and Microsoft social login

- Authorization roles
  - `reviewer`
  - `senior_reviewer`
  - `admin`

- Backend trust model
  - Browser authenticates with Next.js
  - Next.js validates Better Auth session
  - Next.js proxies trusted user identity and role context to FastAPI
  - FastAPI enforces all mutating authorization checks

- Review workflow
  - Reviewer can accept or reject ordinary cases
  - Reviewer can escalate to senior review
  - Escalation moves case to `pending_senior_review`
  - Senior reviewer or admin resolves escalated cases
  - No send-back path in v1

- Audit model
  - Append-only review events
  - Append-only case comments
  - Historical attribution preserved after user deactivation

## Open Areas Not Yet Resolved

- Exact review-event schema and comment schema
- Exact invite acceptance flow for email/password plus social login
- Account linking policy for users who start with one provider and later use another
- Exact FastAPI trust mechanism for proxied identity headers
- Whether claim resolution should record a role snapshot, display name snapshot, or both
- Exact admin actions for deactivation, reactivation, and invite resend

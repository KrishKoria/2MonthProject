---
phase: 1
slug: auth-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` (frontend), `pytest` + `pytest-asyncio` (backend — no changes expected) |
| **Config file** | `frontend/package.json` (`bun test`) |
| **Quick run command** | `cd frontend && bun test` |
| **Full suite command** | `cd frontend && bun test && bun run lint` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && bun test`
- **After every plan wave:** Run `cd frontend && bun test && bun run lint`
- **Before `/gsd-verify-work`:** Full suite must be green + `bunx drizzle-kit generate` produces valid migration files
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | AUTH-01 | — | `disableSignUp: true` blocks public signup | unit | `cd frontend && bun test src/lib/auth.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | AUTH-01 | — | Invite token stored and validated before account creation | unit | `cd frontend && bun test src/lib/auth.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | AUTH-02 | — | Google social login rejects mismatched email | unit | `cd frontend && bun test src/lib/auth.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | AUTH-03 | — | Microsoft social login rejects mismatched email | unit | `cd frontend && bun test src/lib/auth.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | AUTH-05 | — | Session persists after simulated page reload (cookie present) | unit | `cd frontend && bun test src/lib/auth-session.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-06 | 01 | 1 | AUTH-06 | — | `banUser()` updates `banned: true` in db and revokes sessions | unit | `cd frontend && bun test src/lib/auth-session.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-07 | 01 | 1 | ACCESS-03 | — | Non-admin call to deactivate route returns 403 | unit | `cd frontend && bun test "src/app/api/admin/users/[userId]/deactivate/route.test.ts"` | ❌ W0 | ⬜ pending |
| 1-01-08 | 01 | 1 | ACCESS-04 | — | `unbanUser()` restores access; role field unchanged | unit | `cd frontend && bun test src/lib/auth-session.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/lib/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-03 (invite-only enforcement, email matching)
- [ ] `frontend/src/lib/auth-session.test.ts` — stubs for AUTH-05, AUTH-06, ACCESS-04 (session helpers, ban/unban)
- [ ] `frontend/src/app/api/admin/users/[userId]/deactivate/route.test.ts` — stubs for ACCESS-03 (403 enforcement)

*All test files are new — no existing test infrastructure to extend.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth social login accepts matching invited email end-to-end | AUTH-02 | Requires live Google OAuth credentials and redirect flow | Sign in with Google using an email present in invitations table; confirm session created |
| Microsoft OAuth social login accepts matching invited email end-to-end | AUTH-03 | Requires live Microsoft OAuth credentials and redirect flow | Sign in with Microsoft using an email present in invitations table; confirm session created |
| Session survives browser refresh in real browser | AUTH-05 | Cookie persistence cannot be fully automated in bun:test | Log in, refresh page, confirm still authenticated |
| Deactivation immediately blocks active session | AUTH-06 | Real-time session revocation requires live DB + real session | Log in, deactivate user via admin API, confirm next request is rejected |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

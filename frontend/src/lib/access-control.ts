/**
 * Role-based access predicate functions.
 *
 * These functions are the single source of truth for role checks used by:
 * - Session helpers (auth-session.ts)
 * - Route handlers (api/admin/*)
 * - UI components (Phase 5)
 *
 * All functions are pure and synchronous — no DB or session access here.
 */
import type { AppRole } from "./access-types";

/**
 * Returns true if the role grants access to the admin console (/admin).
 * Only "admin" role has admin console access.
 */
export function canAccessAdmin(role: AppRole | null): boolean {
  return role === "admin";
}

/**
 * Returns true if the role can resolve escalated (pending_senior_review) cases.
 * "senior_reviewer" and "admin" can resolve escalations.
 * "reviewer" cannot — they can escalate but not resolve (REVIEW-04, REVIEW-05).
 */
export function canResolveEscalation(role: AppRole | null): boolean {
  return role === "senior_reviewer" || role === "admin";
}

/**
 * Returns true if the role is an operational role that can view and act on claims.
 * All three defined roles are operational.
 * null (no role / not yet set) is NOT operational — user sees access-denied (ACCESS-07).
 */
export function isOperationalRole(role: AppRole | null): boolean {
  return role === "reviewer" || role === "senior_reviewer" || role === "admin";
}

/**
 * Returns a display label for a role. Used in UI and audit event copy.
 */
export function roleDisplayName(role: AppRole): string {
  switch (role) {
    case "reviewer":
      return "Reviewer";
    case "senior_reviewer":
      return "Senior Reviewer";
    case "admin":
      return "Admin";
  }
}

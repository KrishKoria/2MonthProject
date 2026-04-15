/**
 * Canonical role and session types for the Claims Investigation Workbench.
 *
 * AppRole is the ONLY authoritative role definition — do not use Better Auth
 * admin plugin's built-in role field (D-07). Role is stored as additionalFields
 * on the BA user table (D-05, D-06).
 */

/**
 * Application roles. Single role per user (D-13).
 * "reviewer"        — can accept/reject/escalate ordinary cases
 * "senior_reviewer" — can resolve escalated cases (superset of reviewer)
 * "admin"           — full access including user management
 */
export type AppRole = "reviewer" | "senior_reviewer" | "admin";

/**
 * Subset of the Better Auth session user shape that this app cares about.
 * role is additionalFields.role (not admin plugin role — D-07).
 * banned maps to the admin plugin's banned column (used for deactivation — D-03).
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  /** App role from additionalFields.role. Null if invite not yet accepted or role not assigned. */
  role: AppRole | null;
  /** True when user is deactivated via admin plugin banUser() (D-03). */
  banned: boolean;
}

/**
 * Session shape returned by auth.api.getSession() — includes session metadata and user.
 */
export interface AppSession {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
  };
  user: SessionUser;
}

/**
 * Row shape for the custom_invitations table.
 * Mirrors src/db/schema.ts CustomInvitation — kept separate to avoid
 * importing Drizzle types into client-safe code.
 */
export interface InviteRecord {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

/**
 * Access audit event types for the access_audit_events table.
 */
export type AuditEventType = "invited" | "role_changed" | "deactivated" | "reactivated";

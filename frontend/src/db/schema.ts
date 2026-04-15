/**
 * App-specific Drizzle schema tables.
 *
 * Better Auth auto-generates: user, session, account, verification.
 * We hand-author only: custom_invitations, access_audit_events.
 *
 * Run `bunx auth@latest generate` and review BA column output before
 * running `bunx drizzle-kit generate` (open question from RESEARCH.md).
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * custom_invitations: tracks invite tokens sent by admins.
 * token expires 7 days from creation (D-14).
 * Re-invite sets cancelledAt on the previous pending row (D-14).
 */
export const customInvitations = pgTable("custom_invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(), // AppRole: "reviewer" | "senior_reviewer" | "admin"
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }), // set on re-invite per D-14
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * access_audit_events: append-only log of access-control changes.
 * Events: invited, role_changed, deactivated, reactivated.
 * Actor is the admin who performed the action.
 */
export const accessAuditEvents = pgTable("access_audit_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(), // "invited" | "role_changed" | "deactivated" | "reactivated"
  targetUserId: text("target_user_id").notNull(),
  targetEmail: text("target_email").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  previousRole: text("previous_role"), // null for "invited" events
  newRole: text("new_role"), // null for "deactivated"/"reactivated" events
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CustomInvitation = typeof customInvitations.$inferSelect;
export type NewCustomInvitation = typeof customInvitations.$inferInsert;
export type AccessAuditEvent = typeof accessAuditEvents.$inferSelect;
export type NewAccessAuditEvent = typeof accessAuditEvents.$inferInsert;

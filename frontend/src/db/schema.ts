/**
 * Drizzle schema for the Claims Investigation Workbench.
 *
 * Section 1: Better Auth core tables — must match what betterAuth({ database: drizzleAdapter(...) })
 * expects, including additionalFields (role) and admin plugin columns (banned, banReason, banExpires).
 *
 * Section 2: App-specific tables — custom_invitations, access_audit_events.
 *
 * After any schema change run: bunx drizzle-kit generate
 */
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Section 1: Better Auth core tables — generated from auth.ts config.
// admin plugin adds: banned (boolean), banReason (text), banExpires (timestamp).
// user.additionalFields adds: role (text) — the canonical AppRole column (D-05/D-06).
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // additionalFields (D-05/D-06)
  role: text("role"),
  // admin plugin fields (D-03)
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Section 2: App-specific tables
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

// Better Auth core types
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

// App-specific types
export type CustomInvitation = typeof customInvitations.$inferSelect;
export type NewCustomInvitation = typeof customInvitations.$inferInsert;
export type AccessAuditEvent = typeof accessAuditEvents.$inferSelect;
export type NewAccessAuditEvent = typeof accessAuditEvents.$inferInsert;

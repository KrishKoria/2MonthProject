/**
 * Better Auth server instance for the Claims Investigation Workbench.
 *
 * Configuration decisions:
 * - D-03: Deactivation uses admin plugin banUser() - sets banned:true, revokes all sessions
 * - D-05/D-06: App role stored in additionalFields.role - NOT admin plugin built-in role (D-07)
 * - D-11: db client uses drizzle-orm/neon-serverless Pool (NOT neon-http - no transaction support)
 * - D-12: Account linking: trustedProviders, allowDifferentEmails:false
 * - cookieCache is deliberately NOT enabled - session reads must hit DB so banned check is live (AUTH-06)
 *
 * NEVER import this file in browser/client components - server-only.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // D-01/AUTH-01: No public signup - admin-invited accounts only.
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: "common", // Accepts both personal (MSA) and org (Entra ID) accounts.
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      // D-12: Social login must match an invited email - block email mismatch linking.
      trustedProviders: ["google", "microsoft", "email-password"],
      allowDifferentEmails: false,
    },
  },

  user: {
    additionalFields: {
      // D-05/D-06: App role column on the BA user table.
      // D-07: This is the CANONICAL role - NOT the admin plugin's built-in role field.
      role: {
        type: "string", // Runtime values: AppRole ("reviewer" | "senior_reviewer" | "admin")
        required: false,
        defaultValue: null,
        input: false, // Users cannot self-assign role - admin only (D-13).
      },
    },
  },

  plugins: [
    admin(), // Provides banUser/unbanUser (D-03, D-04) and adds banned:boolean to user table.
    // The admin plugin also adds its own 'role' column - we deliberately ignore it (D-07).
    // Do NOT call admin.setRole() for app roles.
  ],

  // cookieCache is intentionally absent.
  // If enabled, banned users could remain "active" until cache TTL expires,
  // violating AUTH-06 (immediate session revocation on deactivation).
});

/**
 * Inferred session type from the Better Auth instance.
 * For app code that needs only the user fields, prefer AppSession from access-types.ts.
 */
export type BetterAuthSession = typeof auth.$Infer.Session;
export type AppSession = BetterAuthSession;

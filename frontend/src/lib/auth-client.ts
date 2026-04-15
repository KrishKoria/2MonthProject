/**
 * Better Auth browser client.
 *
 * Used in React client components for:
 * - authClient.useSession() - reactive session state
 * - authClient.signIn.email() - email/password sign-in (Phase 2 pages)
 * - authClient.signIn.social() - Google/Microsoft sign-in (Phase 2 pages)
 * - authClient.signOut() - sign-out (Phase 2)
 * - authClient.admin.banUser() / unbanUser() - NOT called from browser; server-only (see auth-session.ts)
 *
 * Do NOT import auth.ts (server-only) here.
 */
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3000",
  plugins: [adminClient()],
});

/**
 * Type-safe session hook for client components.
 * Returns { data: session | null, isPending, error }.
 */
export const { useSession, signIn, signOut } = authClient;

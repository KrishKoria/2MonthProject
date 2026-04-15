/**
 * Server-side session helpers.
 *
 * These helpers wrap auth.api.getSession() for use in:
 * - Server components (await requireSession() at the top)
 * - Route handlers (await requireAdminSession() before admin actions)
 *
 * NEVER import this file in browser/client components.
 * Use authClient.useSession() from auth-client.ts for client-side session state.
 */
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/access-control";
import type { AppSession } from "@/lib/access-types";

/**
 * Returns the current session if one exists, or null.
 * Does NOT redirect or throw — caller decides how to handle null.
 */
export async function getOptionalSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session as AppSession | null;
}

/**
 * Returns the current session, or throws an error if the user is not authenticated.
 * Route handlers should catch this and return 401.
 * Server components should handle the error with a redirect to /sign-in (Phase 2).
 *
 * @throws Error with message "Not authenticated"
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getOptionalSession();
  if (!session) {
    throw new Error("Not authenticated");
  }
  return session;
}

/**
 * Returns the current session, or throws if the user is not authenticated or not an admin.
 * Only "admin" role passes (D-06, canAccessAdmin).
 *
 * @throws Error with message "Not authenticated" (no session)
 * @throws Error with message "Forbidden" (wrong role)
 */
export async function requireAdminSession(): Promise<AppSession> {
  const session = await requireSession();
  if (!canAccessAdmin(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

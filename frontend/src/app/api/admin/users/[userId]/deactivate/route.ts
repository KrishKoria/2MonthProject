/**
 * POST /api/admin/users/[userId]/deactivate
 *
 * Deactivates a user by calling auth.api.banUser().
 * Better Auth's ban mechanism:
 *   1. Sets banned:true on the user row
 *   2. Revokes ALL active sessions for that user immediately
 * This satisfies AUTH-06 and ACCESS-03.
 *
 * Requires: caller must have role="admin" (requireAdminSession enforces this).
 * Server-side only: banUser must be called from a route handler, not browser code.
 */
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdminSession } from "@/lib/auth-session";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  // Verify caller is an admin - throws "Forbidden" if not.
  try {
    await requireAdminSession();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "Not authenticated" ? 401 : 403;
    return NextResponse.json({ error: { code: "forbidden", message } }, { status });
  }

  const { userId } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: { code: "validation_error", message: "userId is required" } }, { status: 400 });
  }

  try {
    await auth.api.banUser({
      body: { userId },
      headers: await headers(),
    });

    return NextResponse.json({ data: { deactivated: true, userId } });
  } catch (err) {
    console.error("[deactivate] banUser failed:", err);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to deactivate user" } },
      { status: 500 },
    );
  }
}

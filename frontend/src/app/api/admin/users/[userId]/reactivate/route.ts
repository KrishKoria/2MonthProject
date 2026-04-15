/**
 * POST /api/admin/users/[userId]/reactivate
 *
 * Reactivates a deactivated user by calling auth.api.unbanUser().
 * Better Auth's unban mechanism:
 *   1. Sets banned:false on the user row
 *   2. Role field is NOT modified - previous role is preserved (D-04, ACCESS-04)
 *   3. User must sign in fresh after reactivation (D-15)
 *
 * Requires: caller must have role="admin" (requireAdminSession enforces this).
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
    await auth.api.unbanUser({
      body: { userId },
      headers: await headers(),
    });

    return NextResponse.json({ data: { reactivated: true, userId } });
  } catch (err) {
    console.error("[reactivate] unbanUser failed:", err);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to reactivate user" } },
      { status: 500 },
    );
  }
}

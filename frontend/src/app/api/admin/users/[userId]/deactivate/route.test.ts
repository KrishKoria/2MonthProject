import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

// These imports will fail until Wave 3 implementation exists.
// That is the expected RED state for Wave 0.
import { POST as deactivatePOST } from "@/app/api/admin/users/[userId]/deactivate/route";

// Minimal Next.js Request mock
function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest("http://localhost/api/admin/users/user-1/deactivate", {
    method: "POST",
    headers,
  });
  return req;
}

describe("POST /api/admin/users/[userId]/deactivate — ACCESS-03", () => {
  test("returns 403 when caller has no session (unauthenticated)", async () => {
    // requireAdminSession() will throw — route must catch and return 403
    const response = await deactivatePOST(makeRequest(), { params: Promise.resolve({ userId: "user-1" }) });
    expect(response.status).toBe(403);
  });

  test("handler is exported as POST (route structure validation)", () => {
    expect(typeof deactivatePOST).toBe("function");
  });
});

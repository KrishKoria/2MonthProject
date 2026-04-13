import { expect, test } from "bun:test";

test("GET requests omit JSON content-type headers", async () => {
  const mod = await import("./api");
  const originalFetch = globalThis.fetch;
  let capturedHeaders: HeadersInit | undefined;

  globalThis.fetch = (async (_input, init) => {
    capturedHeaders = init?.headers;
    return new Response(
      JSON.stringify({
        data: {
          claims: [],
          page: 1,
          page_size: 25,
          total: 0,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    await mod.api.listClaims();

    const headers = new Headers(capturedHeaders);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

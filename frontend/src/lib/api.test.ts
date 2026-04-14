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

test("server-side requests prefer API_BASE_URL over NEXT_PUBLIC_API_BASE_URL", async () => {
  const mod = await import("./api");
  const originalFetch = globalThis.fetch;
  const previousApiBaseUrl = process.env.API_BASE_URL;
  const previousPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  let capturedUrl = "";

  process.env.API_BASE_URL = "http://backend.internal:8000";
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://public.example:8000";

  globalThis.fetch = (async (input) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify({
        data: {
          claim: {
            claim_id: "CLM-100",
          },
          risk_score: null,
          investigation: null,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    await mod.api.getClaim("CLM-100");
    expect(capturedUrl).toBe("http://backend.internal:8000/api/claims/CLM-100");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.API_BASE_URL = previousApiBaseUrl;
    process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicBaseUrl;
  }
});

test("browser-side requests default to relative API paths when no base URL is configured", async () => {
  const mod = await import("./api");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const previousApiBaseUrl = process.env.API_BASE_URL;
  const previousPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  let capturedUrl = "";

  process.env.API_BASE_URL = undefined;
  process.env.NEXT_PUBLIC_API_BASE_URL = undefined;
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
  });

  globalThis.fetch = (async (input) => {
    capturedUrl = String(input);
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
    expect(capturedUrl).toBe("/api/claims");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.API_BASE_URL = previousApiBaseUrl;
    process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicBaseUrl;
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  }
});

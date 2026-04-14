import { expect, test } from "bun:test";

function streamFromChunks(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

test("streamInvestigation handles CRLF-delimited SSE frames", async () => {
  const mod = await import("./sse");
  const originalFetch = globalThis.fetch;
  const triagePayload = {
    anomaly_type: "duplicate",
    anomaly_flags: {
      upcoding: "not_applicable",
      ncci_violation: "not_applicable",
      duplicate: "detected",
    },
    confidence: 0.91,
    priority: "high",
    evidence_tools_to_use: ["duplicate_search"],
  };
  const completePayload = {
    claim_id: "CLM-100",
    investigation_status: "complete",
    triage: triagePayload,
    evidence: null,
    rationale: null,
    human_decision: null,
    created_at: "2026-04-13T00:00:00Z",
    updated_at: "2026-04-13T00:00:02Z",
  };

  globalThis.fetch = (async () =>
    new Response(
      streamFromChunks([
        `event: triage\r\ndata: ${JSON.stringify(triagePayload)}\r\n\r\n`,
        `event: complete\r\ndata: ${JSON.stringify(completePayload)}\r\n\r\n`,
      ]),
      {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      },
    )) as typeof fetch;

  const seenEvents: string[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      mod.streamInvestigation(
        "CLM-100",
        {
          onTriage: () => {
            seenEvents.push("triage");
          },
          onComplete: () => {
            seenEvents.push("complete");
          },
          onNetworkError: reject,
          onClose: resolve,
        },
        "http://example.test",
      );
    });

    expect(seenEvents).toEqual(["triage", "complete"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamInvestigation defaults to NEXT_PUBLIC_API_BASE_URL", async () => {
  const mod = await import("./sse");
  const originalFetch = globalThis.fetch;
  const previousPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  let capturedUrl = "";

  process.env.NEXT_PUBLIC_API_BASE_URL = "http://public.example:8000";

  globalThis.fetch = (async (input) => {
    capturedUrl = String(input);
    return new Response(streamFromChunks([]), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof fetch;

  try {
    await new Promise<void>((resolve) => {
      mod.streamInvestigation("CLM-200", { onClose: resolve });
    });

    expect(capturedUrl).toBe(
      "http://public.example:8000/api/claims/CLM-200/investigate",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicBaseUrl;
  }
});

test("streamInvestigation defaults to a relative path in the browser when no base URL is configured", async () => {
  const mod = await import("./sse");
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
    return new Response(streamFromChunks([]), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof fetch;

  try {
    await new Promise<void>((resolve) => {
      mod.streamInvestigation("CLM-200", { onClose: resolve });
    });

    expect(capturedUrl).toBe("/api/claims/CLM-200/investigate");
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

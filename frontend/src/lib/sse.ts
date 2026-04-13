// Typed SSE client for POST /api/claims/{id}/investigate.
// EventSource only supports GET, so we stream the response body via fetch
// and parse the `event:` / `data:` frame format manually.

import type {
  CompleteEvent,
  ErrorEvent as InvestigationErrorEvent,
  EvidenceEvent,
  HaltEvent,
  InvestigationEvent,
  RationaleChunkEvent,
  TriageEvent,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  "http://localhost:8000";

type KnownEventName = InvestigationEvent["event"];

const KNOWN_EVENTS: ReadonlySet<KnownEventName> = new Set<KnownEventName>([
  "triage",
  "evidence",
  "rationale_chunk",
  "complete",
  "halt",
  "error",
]);

export interface StreamHandlers {
  onEvent?: (event: InvestigationEvent) => void;
  onTriage?: (e: TriageEvent) => void;
  onEvidence?: (e: EvidenceEvent) => void;
  onRationaleChunk?: (e: RationaleChunkEvent) => void;
  onComplete?: (e: CompleteEvent) => void;
  onHalt?: (e: HaltEvent) => void;
  onError?: (e: InvestigationErrorEvent) => void;
  onNetworkError?: (err: unknown) => void;
  onClose?: () => void;
}

function dispatch(handlers: StreamHandlers, evt: InvestigationEvent) {
  handlers.onEvent?.(evt);
  switch (evt.event) {
    case "triage":
      handlers.onTriage?.(evt);
      break;
    case "evidence":
      handlers.onEvidence?.(evt);
      break;
    case "rationale_chunk":
      handlers.onRationaleChunk?.(evt);
      break;
    case "complete":
      handlers.onComplete?.(evt);
      break;
    case "halt":
      handlers.onHalt?.(evt);
      break;
    case "error":
      handlers.onError?.(evt);
      break;
  }
}

function parseFrame(frame: string): InvestigationEvent | null {
  let eventName: string | null = null;
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!eventName || !KNOWN_EVENTS.has(eventName as KnownEventName)) return null;
  const payload = dataLines.join("\n");
  if (!payload) return null;
  try {
    const data = JSON.parse(payload);
    return { event: eventName, data } as InvestigationEvent;
  } catch {
    return null;
  }
}

/**
 * Stream an investigation. Returns an AbortController — call `.abort()` to cancel.
 * Handlers are invoked in event order. Completion is signalled by `onClose`.
 */
export function streamInvestigation(
  claimId: string,
  handlers: StreamHandlers,
  baseUrl: string = DEFAULT_BASE_URL,
): AbortController {
  const controller = new AbortController();
  const url = `${baseUrl}/api/claims/${encodeURIComponent(claimId)}/investigate`;

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        handlers.onNetworkError?.(
          new Error(`Stream failed: ${res.status} ${res.statusText}`),
        );
        handlers.onClose?.();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseFrame(frame);
          if (parsed) dispatch(handlers, parsed);
        }
      }

      // Flush any trailing frame (unlikely but safe).
      if (buffer.trim()) {
        const parsed = parseFrame(buffer);
        if (parsed) dispatch(handlers, parsed);
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        handlers.onNetworkError?.(err);
      }
    } finally {
      handlers.onClose?.();
    }
  })();

  return controller;
}

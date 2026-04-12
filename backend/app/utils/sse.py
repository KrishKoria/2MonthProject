"""SSE streaming helpers.

Wraps sse-starlette's EventSourceResponse with the headers required by the
constitution and contracts/sse-events.md:
    - Content-Type: text/event-stream
    - Cache-Control: no-cache
    - X-Accel-Buffering: no
    - Connection: keep-alive
CORS is applied by app.main's CORSMiddleware.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Awaitable, Callable

from sse_starlette.sse import EventSourceResponse

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


def sse_event(event: str, data: Any) -> dict[str, str]:
    """Format a single SSE event dict for sse-starlette."""
    payload = data if isinstance(data, str) else json.dumps(data, default=str)
    return {"event": event, "data": payload}


def stream_response(
    generator: AsyncIterator[dict[str, str]] | Callable[[], AsyncIterator[dict[str, str]]],
) -> EventSourceResponse:
    """Wrap an async event generator as an EventSourceResponse with required headers."""
    gen = generator() if callable(generator) else generator

    async def _wrap() -> AsyncIterator[dict[str, str]]:
        async for item in gen:
            yield item

    return EventSourceResponse(_wrap(), headers=SSE_HEADERS)


async def emit(
    send: Callable[[dict[str, str]], Awaitable[None]],
    event: str,
    data: Any,
) -> None:
    """Helper to emit a single event via an async send callback (for tests)."""
    await send(sse_event(event, data))

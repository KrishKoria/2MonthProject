# Architecture Research: Auth Proxy + Trusted Identity

**Project:** Claims Investigation Workbench — Milestone 1 Auth + Review Hierarchy
**Researched:** 2026-04-15
**Sources:** Next.js 16.2.3 official docs (node_modules/next/dist/docs + nextjs.org), Better Auth GitHub repo (demo/nextjs), FastAPI dependency injection docs

---

## Next.js Proxy Handler Pattern

### Critical Breaking Change in Next.js 16: middleware.ts → proxy.ts

Next.js 16 renamed `middleware.ts` to `proxy.ts` and the exported function from `middleware()` to `proxy()`. The file lives at `src/proxy.ts` (same level as `app/`). The functionality is identical but the file/export names changed.

```
# Migration provided by Next.js
npx @next/codemod@canary middleware-to-proxy .
```

**Confidence: HIGH** — verified from both `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, version 16.2.3.

### Route Handler Proxy: Forwarding Method, Body, and Headers

The official documented pattern for proxying to a backend in a catch-all route handler (`app/api/[...slug]/route.ts`) is to construct a new `Request` using the original request object, which preserves method, body, and headers:

```typescript
// app/api/[...slug]/route.ts
import { verifySession } from '@/lib/dal'

export async function POST(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  // 1. Validate session
  const session = await verifySession()   // throws redirect if not authed
  if (!session) return new Response(null, { status: 401 })

  // 2. Build upstream URL
  const { slug } = await params
  const pathname = '/api/' + slug.join('/')
  const upstreamURL = new URL(pathname, process.env.INTERNAL_API_BASE_URL)
  // Preserve query string
  upstreamURL.search = new URL(request.url).search

  // 3. Construct forwarded request, cloning original to preserve body
  const outgoing = new Request(upstreamURL, request)   // inherits method, body, headers

  // 4. Inject identity envelope headers, overwriting any spoofed values
  const forwardHeaders = new Headers(outgoing.headers)
  forwardHeaders.set('x-internal-secret', process.env.INTERNAL_PROXY_SECRET!)
  forwardHeaders.set('x-actor-id', session.user.id)
  forwardHeaders.set('x-actor-email', session.user.email)
  forwardHeaders.set('x-actor-role', session.user.role)
  forwardHeaders.set('x-actor-display-name', session.user.name)
  // Strip any client-sent spoofing attempts
  forwardHeaders.delete('x-forwarded-for')  // or set explicitly

  const proxyRequest = new Request(upstreamURL, {
    method: request.method,
    headers: forwardHeaders,
    body: request.body,         // ReadableStream — works for streaming uploads
    duplex: 'half',             // required when body is a ReadableStream
  })

  return fetch(proxyRequest)    // return Response directly — works for streaming
}

// All HTTP methods must be exported to avoid 405 errors
export { POST as GET, POST as PUT, POST as PATCH, POST as DELETE }
```

**Key points:**
- `new Request(url, existingRequest)` copies method, body, and headers. This is the officially documented BFF proxy pattern.
- Body is a `ReadableStream`. Passing `body: request.body` streams the body through without buffering it in memory — critical for large payloads.
- `duplex: 'half'` is required by the fetch spec when body is a ReadableStream.
- Returning `fetch(proxyRequest)` directly forwards the upstream Response (including its body stream) back to the client. This is how streaming (including SSE) passes through.
- You **must** set identity headers after constructing the outgoing headers, not before, to prevent clients from spoofing them.
- `request.body` can only be consumed once. Clone the request only if validation logic needs to read the body before proxying: `const cloned = request.clone()`.

**Confidence: HIGH** — pattern taken directly from the official BFF proxying guide at `nextjs.org/docs/app/guides/backend-for-frontend`.

### Important: `dynamic = 'force-dynamic'` in Next.js 16

In Next.js 16, the `dynamic`, `revalidate`, and `fetchCache` route segment config options are **removed** when `cacheComponents` is enabled. However, for route handlers that proxy to a backend, all route handlers are dynamic by default (they depend on request data). You do not need to export `dynamic = 'force-dynamic'` for route handlers that consume `request` — they are already dynamic. Confirm this by checking whether the project uses Cache Components (`cacheComponents: true` in `next.config.ts` — the current config does not set this).

---

## SSE Proxy Compatibility

### Answer: Yes, SSE Streams Through a Route Handler

The `fetch()` call in a route handler returns a `Response` whose `body` is a `ReadableStream`. When you `return fetch(proxyRequest)`, Next.js forwards that stream to the browser without buffering.

The FastAPI backend uses `sse-starlette`'s `EventSourceResponse`, which sets:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `X-Accel-Buffering: no`
- `Connection: keep-alive`

These headers are preserved in the forwarded Response because `return fetch(...)` passes the upstream headers through.

**What the Next.js docs confirm:** The streaming guide explicitly documents that Route Handlers can stream raw responses using the Web Streams API, and the SSE example uses `text/event-stream` with `ReadableStream`. Returning the upstream `fetch()` response directly means the browser receives the SSE stream as-is.

**Practical pattern for the investigation SSE endpoint:**

```typescript
// app/api/claims/[claimId]/investigate/route.ts
export async function POST(
  request: Request,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const session = await verifySession()
  const { claimId } = await params

  const upstreamURL = new URL(
    `/api/claims/${claimId}/investigate`,
    process.env.INTERNAL_API_BASE_URL
  )

  const forwardHeaders = new Headers()
  forwardHeaders.set('content-type', request.headers.get('content-type') || 'application/json')
  forwardHeaders.set('x-internal-secret', process.env.INTERNAL_PROXY_SECRET!)
  forwardHeaders.set('x-actor-id', session.user.id)
  forwardHeaders.set('x-actor-email', session.user.email)
  forwardHeaders.set('x-actor-role', session.user.role)
  forwardHeaders.set('x-actor-display-name', session.user.name)

  const upstream = await fetch(upstreamURL.toString(), {
    method: 'POST',
    headers: forwardHeaders,
    body: request.body,
    duplex: 'half',
  })

  // Return the upstream response directly — the SSE stream passes through
  return upstream
}
```

**Caveats:**
- The route handler must NOT buffer the upstream response body before returning (do not call `await upstream.json()` or `await upstream.text()` — return the Response object directly).
- If the Next.js app is behind Nginx, Nginx buffers SSE by default. The `X-Accel-Buffering: no` header from `sse-starlette` disables this. The local dev setup (no Nginx) has no buffering issue.
- Avoid Vercel's free/hobby tier for SSE — serverless functions close connections on timeout. The current setup runs a local Docker or Node.js server, so this is not a concern.

**Confidence: HIGH** — Documented in `node_modules/next/dist/docs/01-app/02-guides/streaming.md` section "Streaming in Route Handlers" and in `nextjs.org/docs/app/guides/backend-for-frontend` under "Proxying to a backend".

---

## FastAPI Trusted Header Pattern

### 1. Dependency Function for Secret Validation

Use FastAPI's `Depends()` system to create a reusable security dependency that validates both the shared secret and the required actor headers:

```python
# app/api/dependencies.py — add to existing file
import hmac
import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

from app.config import settings


class ActorIdentity(BaseModel):
    """Verified identity envelope forwarded by the Next.js proxy."""
    user_id: str
    email: str
    role: str
    display_name: str


def get_actor_identity(
    x_internal_secret: Annotated[str | None, Header()] = None,
    x_actor_id: Annotated[str | None, Header()] = None,
    x_actor_email: Annotated[str | None, Header()] = None,
    x_actor_role: Annotated[str | None, Header()] = None,
    x_actor_display_name: Annotated[str | None, Header()] = None,
) -> ActorIdentity:
    """
    Validate the shared proxy secret and return a verified ActorIdentity.
    Raises 403 if the secret is absent or wrong.
    Raises 422 if required actor headers are missing.

    Use hmac.compare_digest for timing-safe comparison to prevent
    timing oracle attacks on the secret.
    """
    if not x_internal_secret or not settings.INTERNAL_PROXY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing proxy secret",
        )

    # Timing-safe comparison: prevents an attacker from measuring
    # response time to guess the secret byte-by-byte.
    expected = settings.INTERNAL_PROXY_SECRET.encode()
    provided = x_internal_secret.encode()
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid proxy secret",
        )

    if not all([x_actor_id, x_actor_email, x_actor_role, x_actor_display_name]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing required actor identity headers",
        )

    return ActorIdentity(
        user_id=x_actor_id,       # type: ignore[arg-type]  (checked above)
        email=x_actor_email,
        role=x_actor_role,
        display_name=x_actor_display_name,
    )


# Reusable type alias for injection
ActorDep = Annotated[ActorIdentity, Depends(get_actor_identity)]
```

### 2. Apply at Router Level (Preferred for PROXY-02)

PROXY-02 requires validation on "every mutating request." Rather than adding the dependency to every route individually, attach it to the router using `dependencies=[]`:

```python
# app/api/routes/claims.py — add router-level dependency
from app.api.dependencies import get_actor_identity

router = APIRouter(
    prefix="/api/claims",
    tags=["claims"],
    dependencies=[Depends(get_actor_identity)],   # enforced on all routes
)
```

For routes that also need to *use* the actor identity (for audit snapshots), inject it explicitly in the route signature using `ActorDep`:

```python
from app.api.dependencies import ActorDep

@router.post("/{claim_id}/review")
async def submit_review(
    claim_id: str,
    body: ReviewRequest,
    actor: ActorDep,            # resolves to ActorIdentity
    store: DataStoreDep,
):
    # actor.user_id, actor.role, actor.display_name available here
    ...
```

### 3. Read-Only Endpoints

For GET endpoints that only read data and don't record actor identity, a lighter dependency that validates only the secret (skipping actor header checks) can be used. However, given this is an internal workbench where all reads are authenticated, applying `get_actor_identity` uniformly is cleaner and safer. The overhead is negligible (one `hmac.compare_digest` + header reads).

### 4. Settings Addition

```python
# app/config.py — add to Settings class
INTERNAL_PROXY_SECRET: str = ""
```

Generate with `openssl rand -hex 32` and store in `.env` files for both frontend and backend. Never commit the value.

### 5. Why `hmac.compare_digest` and Not `==`

String equality (`==`) in Python short-circuits on the first mismatched byte, leaking timing information. An attacker in the same datacenter can measure response latency to recover the secret one character at a time. `hmac.compare_digest` runs in constant time regardless of where the mismatch occurs. This is a standard defense even for secrets that are not HMAC signatures — it applies to any shared secret comparison.

**Confidence: HIGH** — `hmac.compare_digest` is Python stdlib, documented since Python 3.3. The FastAPI `Depends()` + `Header()` pattern is the canonical approach for per-request security validation in FastAPI. Router-level `dependencies=[]` is documented in the FastAPI dependency injection guide.

---

## Middleware Pattern (proxy.ts) for Session Gating

### Key Facts About proxy.ts in Next.js 16

1. The file is named `proxy.ts` (not `middleware.ts`) — renamed in Next.js 16.
2. The exported function is `proxy()` (or a default export).
3. It runs on the Node.js runtime (stable as of Next.js 15.5, confirmed in the version history).
4. It is intended for **optimistic checks only** — fast cookie presence/validity checks. Not for full database session validation.
5. Full session validation (DB lookup) belongs in route handlers and server components, not in `proxy.ts`.

### The Two-Layer Auth Strategy

This project should use two layers:

**Layer 1 — proxy.ts (optimistic, fast):** Check whether the Better Auth session cookie exists. If absent, redirect to sign-in. This is the pattern shown in Better Auth's own demo (`demo/nextjs/proxy.ts`).

**Layer 2 — Route Handler (authoritative):** Call `auth.api.getSession({ headers })` to fully validate the session against the database before proxying to FastAPI. This is where the identity envelope is assembled.

### Better Auth's Session Cookie API

Better Auth provides `getSessionCookie()` from `better-auth/cookies` for use in `proxy.ts`. This reads the session cookie without making a database call — purely a presence/format check:

```typescript
import { getSessionCookie } from "better-auth/cookies"
```

For full validation in route handlers, call `auth.api.getSession({ headers: request.headers })`. This is the server-side API shown throughout the Better Auth demo's `lib/auth.ts`.

### Recommended proxy.ts

```typescript
// src/proxy.ts
import { getSessionCookie } from "better-auth/cookies"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Public routes that do NOT require a session
const PUBLIC_PATHS = new Set([
  "/sign-in",
  "/accept-invite",
  "/bootstrap",
])

// Paths that must always pass through (auth API, Next.js internals)
// Matcher config handles most of this, but belt-and-suspenders check
const ALWAYS_ALLOW_PREFIXES = [
  "/api/auth/",        // Better Auth's own routes
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let Better Auth handle its own routes
  if (ALWAYS_ALLOW_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for public page routes
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  // Optimistic session check — no DB call, just cookie presence
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const signIn = new URL("/sign-in", request.url)
    signIn.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(signIn)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match everything EXCEPT:
     * - _next/static (built assets)
     * - _next/image (image optimisation)
     * - favicon.ico, *.png, *.svg (static files)
     * - /api/auth/* (Better Auth routes — handled separately above, but
     *   excluded from matcher for defence in depth)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|ico)$|api/auth/).*)",
  ],
}
```

### Route Handler Full Session Validation

In the catch-all proxy route handler, after the optimistic proxy.ts check passes, do a full session validation:

```typescript
// src/lib/auth-session.ts
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

export const getVerifiedSession = cache(async () => {
  const headerStore = await headers()
  const session = await auth.api.getSession({ headers: headerStore })

  if (!session?.user) {
    redirect("/sign-in")
  }

  return session
})
```

```typescript
// app/api/[...slug]/route.ts (the catch-all proxy)
import { getVerifiedSession } from "@/lib/auth-session"

export async function POST(request: Request, ...) {
  const session = await getVerifiedSession()
  // session.user.id, session.user.email, session.user.name, session.user.role
  ...
}
```

**Important:** `auth.api.getSession()` does a database round-trip. Using React's `cache()` ensures it is called at most once per request across multiple server components and route handlers in the same render cycle.

### Critical Proxy.ts Limitations to Know

1. **Proxy cannot block `/api/auth/*` routes** — these are Better Auth's own auth endpoints. The matcher must exclude them.
2. **Proxy is not the security boundary** — the Next.js docs explicitly state: "While Proxy can be useful for initial checks, it should not be your only line of defense." The route handler's full `auth.api.getSession()` call is the true gate before any request reaches FastAPI.
3. **Server Functions (Server Actions) note** — the docs warn that proxy matchers do not cover server action calls automatically in all configurations. Since this project uses route handlers (not Server Actions) for the proxy layer, this is not a concern here.

**Confidence: HIGH for proxy.ts rename and pattern** — from official Next.js 16 docs. **HIGH for Better Auth getSessionCookie** — from Better Auth's own demo `proxy.ts` at `demo/nextjs/proxy.ts`. **HIGH for auth.api.getSession** — demonstrated in Better Auth demo `lib/auth.ts`.

---

## Recommendations

### 1. File Structure

```
frontend/src/
  proxy.ts                          # Session gating (was middleware.ts)
  app/api/
    auth/[...all]/route.ts          # Better Auth handler — EXCLUDE from proxy
    [...slug]/route.ts              # Catch-all authenticated proxy to FastAPI
  lib/
    auth.ts                         # Better Auth server config
    auth-client.ts                  # Better Auth browser client
    auth-session.ts                 # getVerifiedSession() cache wrapper

backend/app/api/
  dependencies.py                   # get_actor_identity() + ActorDep
```

### 2. Header Names (Canonical)

Use lowercase `x-` prefixed headers. HTTP headers are case-insensitive but consistent casing prevents bugs:

| Header | Value |
|--------|-------|
| `x-internal-secret` | `INTERNAL_PROXY_SECRET` env value |
| `x-actor-id` | `session.user.id` (Better Auth UUID) |
| `x-actor-email` | `session.user.email` |
| `x-actor-role` | `session.user.role` (from custom field or plugin) |
| `x-actor-display-name` | `session.user.name` |

### 3. Secret Management

- Generate with `openssl rand -hex 32`
- Store in `frontend/.env` as `INTERNAL_PROXY_SECRET` (server-only, no `NEXT_PUBLIC_` prefix)
- Store in `backend/.env` as `INTERNAL_PROXY_SECRET`
- **Never** expose in `NEXT_PUBLIC_*` variables or client bundles
- Rotate by updating both `.env` files simultaneously

### 4. FastAPI CORS Adjustment

Once the proxy is in place, FastAPI's CORS `allow_origins` should be tightened to only allow requests from Next.js's internal address (since browsers never reach FastAPI directly):

```python
# backend/.env
CORS_ALLOW_ORIGINS=http://localhost:3000  # dev; production: internal network only
```

In production, if FastAPI is not network-isolated, add a firewall rule so port 8000 is not publicly reachable. The `INTERNAL_PROXY_SECRET` is a defense-in-depth measure, not a replacement for network isolation.

### 5. What to Do With the Existing blind Rewrite

Remove the `rewrites()` block from `next.config.ts` once the catch-all route handler at `app/api/[...slug]/route.ts` is deployed. The catch-all handler intercepts all `/api/*` requests before the rewrite would apply. Do not leave both active simultaneously — the rewrite would bypass authentication for any path not covered by the catch-all.

### 6. Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| proxy.ts rename (middleware → proxy) | HIGH | Verified in Next.js 16.2.3 installed package + official docs |
| Route handler streaming/SSE passthrough | HIGH | Official BFF guide + streaming guide confirm `return fetch()` passes body stream |
| FastAPI Depends() header validation | HIGH | Standard FastAPI pattern; `hmac.compare_digest` is Python stdlib |
| `hmac.compare_digest` for timing-safety | HIGH | Python stdlib since 3.3, designed exactly for this purpose |
| Better Auth `getSessionCookie` in proxy.ts | HIGH | Taken directly from Better Auth's own demo/nextjs/proxy.ts |
| Better Auth `auth.api.getSession` server-side | HIGH | Demonstrated in Better Auth demo lib/auth.ts |
| `duplex: 'half'` for streaming body | MEDIUM | Required by fetch spec for ReadableStream bodies; not explicitly in Next.js docs but standard fetch API behavior |
| Role field in Better Auth session | MEDIUM | Better Auth's `admin` plugin provides role; exact field name (`user.role`) depends on plugin config, needs verification during implementation |

### 7. Open Questions for Implementation Phase

- **Role field name in Better Auth session**: Better Auth's `admin` plugin adds role management, but the field path on the session object (`session.user.role` vs a separate field) depends on plugin configuration. Verify by checking `auth.$Infer.Session` after installing and configuring the admin plugin.
- **Cookie name for Better Auth session**: `getSessionCookie()` reads the cookie named `better-auth.session_token` by default (or `__Secure-better-auth.session_token` in production with HTTPS). Confirm this does not conflict with any existing cookies.
- **GET requests to FastAPI**: The existing codebase has GET-heavy endpoints (claims list, analytics). The proxy handler needs to handle GET requests without a body. The pattern above works — `new Request(url, { method: 'GET', headers })` correctly omits the body. Test that the `duplex: 'half'` option is not set for GET requests (it should only be set when `body` is present).

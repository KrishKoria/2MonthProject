# Pitfalls: Auth Migration + Review State Refactor

**Project:** Claims Investigation Workbench — Milestone 1
**Researched:** 2026-04-15
**Confidence:** HIGH (Better Auth docs via Context7 + direct codebase inspection)

---

## Auth Middleware Pitfalls

### 1. Redirect loop when `/api/auth/*` is caught by the middleware matcher

**What goes wrong:** The `middleware.ts` matcher is written to protect all routes except auth pages, but the `/api/auth/[...all]` route handler also sits under `/api/*`. If the middleware matcher includes `/api/*`, every auth API call (sign-in POST, session GET) will be intercepted, see no session, and redirect to sign-in — creating an infinite loop before a session can ever be established.

**Prevention:** The matcher must explicitly exclude `/api/auth/*`, the bootstrap route, the accept-invite route, and static assets. A negative lookahead pattern like `/((?!_next/static|_next/image|favicon.ico|api/auth|sign-in|accept-invite|bootstrap).*)` is the standard approach. Better Auth's own migration guide examples show exactly this pattern.

**This project's specific risk:** The existing `next.config.ts` rewrite (`/api/:path*` → FastAPI) will be replaced by route handlers. The new middleware must not try to validate auth on the `/api/auth/*` handler route or on the `/api/bootstrap` route.

### 2. `getSessionCookie` does not read the auth config automatically

**What goes wrong:** The optimistic cookie check in middleware uses `getSessionCookie(request)` from `better-auth/cookies`. Better Auth's own documentation explicitly states: "The `getSessionCookie()` function does not automatically reference the auth config from `auth.ts`. If you customized the cookie name or prefix, you must ensure the configuration in `getSessionCookie()` matches your `auth.ts` config."

If `auth.ts` sets `advanced.cookiePrefix: "claims-app"` but the middleware calls `getSessionCookie(request)` without passing the same config, the middleware will always see no cookie and redirect every authenticated user to sign-in.

**Prevention:** Either keep the default `"better-auth"` cookie prefix and pass nothing, or always pass `{ cookiePrefix: "..." }` to `getSessionCookie()` mirroring what `auth.ts` sets. Centralize the cookie config so it can be imported in both places.

### 3. Optimistic cookie check vs. full session validation — false security

**What goes wrong:** `getSessionCookie()` only checks for the presence of the cookie; it does not validate the session against the database. A deactivated user with a still-valid cookie will pass the middleware check and reach route handlers. For this project, the deactivation requirement (ACCESS-04) means full session validation must happen in every authenticated route handler, not just in middleware.

**Prevention:** Middleware should only perform the optimistic redirect (fast path). Every server action and route handler that performs a privileged operation must call `auth.api.getSession({ headers })` and check that the returned user is active and has the required role. Do not rely on the middleware cookie check as an authorization gate.

### 4. Edge runtime vs. Node.js runtime incompatibility with Better Auth

**What goes wrong:** Next.js middleware runs in the Edge runtime by default. Better Auth's `auth.api.getSession()` requires database access via `pg.Pool`, which is a Node.js API not available in the Edge runtime. Calling it from middleware without `runtime: "nodejs"` will crash at startup with a module resolution error.

**Prevention:** For full session validation in middleware, the plan must set `export const config = { runtime: "nodejs", matcher: [...] }`. This is only available in Next.js 15.2.0+. Since this project uses Next.js 16, this is supported but must be explicitly declared. Alternatively, use the optimistic cookie-only check in middleware (the recommended approach for convenience) and do full validation inside route handlers.

### 5. Middleware not matching dynamic segments correctly

**What goes wrong:** Writing a matcher as `"/api/claims/:id"` does not work — Next.js middleware matchers use path-to-regexp syntax, not Express syntax. The correct form is `"/api/claims/:id*"` or a regex. An incorrect matcher silently skips the middleware for those routes.

**Prevention:** Test matcher patterns against every protected route. The pattern `"/((?!public-routes).*)"` covering all routes except explicitly excluded ones is safer than allowlisting, since new routes are automatically protected.

---

## Proxy Header Pitfalls

### 6. HTTP header names are case-insensitive in the spec, but implementations differ

**What goes wrong:** The plan forwards a trusted identity envelope via headers like `X-User-Id`, `X-User-Email`, `X-User-Role`, `X-User-Name`. Node.js's `http` module normalizes headers to lowercase. Python's `starlette.requests.Request.headers` stores headers case-insensitively but `request.headers.get("X-User-Id")` will fail in environments that lowercase headers during forwarding — it must be `request.headers.get("x-user-id")` or use a case-insensitive lookup. FastAPI/Starlette does handle this correctly via `Headers` which is case-insensitive, but any custom middleware that copies header dicts via dict access (not `.get()`) will silently drop the casing.

**Prevention:** In FastAPI, always use `request.headers.get("x-user-id")` (lowercase). In the Next.js proxy, set headers explicitly with `headers.set("x-user-id", ...)` so the value enters the fetch API in a known form. Never rely on case-sensitivity assumptions.

### 7. `content-type` header forwarded from browser may break FastAPI body parsing

**What goes wrong:** The proxy route handler forwards request headers from the browser to FastAPI. If the browser sends `Content-Type: application/json; charset=utf-8` but the proxy also alters the body (e.g., re-serializes it), the content-type and actual body may diverge. More commonly: if the original request has no body but the proxy unconditionally forwards `Content-Type`, FastAPI may try to parse an empty body and fail.

**Prevention:** Build an explicit whitelist of headers to forward (cookie, authorization, content-type, accept, accept-language) and only include content-type when there is actually a body. Never blindly spread all incoming request headers onto the upstream fetch.

### 8. `host` header forwarding breaks FastAPI CORS validation

**What goes wrong:** If the proxy forwards the `Host` header from the browser, FastAPI receives `Host: localhost:3000` (the Next.js origin) instead of `Host: localhost:8000` (its own origin). This can confuse CORS middleware and cause FastAPI to reject requests with a 403 because the origin doesn't match.

**Prevention:** Explicitly exclude `host` from forwarded headers. The FastAPI `CORSMiddleware` is already configured with `CORS_ALLOW_ORIGINS = "http://localhost:3000"` — this is correct, but only if FastAPI receives its own host in the `Host` header.

### 9. `authorization` header collision if FastAPI ever adds its own bearer check

**What goes wrong:** The current plan uses a shared `INTERNAL_PROXY_SECRET` in a custom header (e.g., `X-Internal-Proxy-Secret`). If the proxy also forwards the browser's `Authorization: Bearer <jwt>` header, and FastAPI ever grows a bearer plugin, the two auth mechanisms will conflict. The FastAPI validator would try to verify the Better Auth JWT, which it has no way to validate.

**Prevention:** Never forward the browser's `Authorization` header to FastAPI. The identity envelope headers (`x-user-id`, `x-user-role`, etc.) plus the shared secret are the complete trust mechanism. Drop any incoming `Authorization` in the proxy before forwarding.

### 10. Missing headers on redirects in the proxy chain

**What goes wrong:** If FastAPI returns a `302 Found` (e.g., a legacy redirect), `fetch()` in the Node.js route handler will automatically follow the redirect. The custom identity headers are not automatically re-sent on the redirected request. The redirect target receives a request with no actor context.

**Prevention:** Set `redirect: "manual"` in the fetch call inside the proxy handler. Inspect the response: if it is a 3xx, return the redirect to the browser rather than following it server-side. Alternatively, ensure FastAPI never redirects for API calls (it shouldn't — it should only return JSON).

### 11. SSE endpoint: response body must not be buffered by the proxy

**What goes wrong:** The Next.js route handler proxy for `/api/claims/[id]/investigate` must forward the SSE stream without buffering. If the route handler builds a standard `Response` object and awaits the entire body, it will wait until FastAPI closes the stream (which won't happen until the investigation is complete) before forwarding anything. The client sees nothing until the stream ends.

**Prevention:** See SSE Proxy Pitfalls section below. The SSE endpoint needs special treatment in the proxy — it cannot be treated the same as JSON endpoints.

---

## Event Log Migration Pitfalls

### 12. In-flight writes during the cutover window will lose data or split state

**What goes wrong:** The `DataStore` uses an in-memory store. When the `human_decision` field is removed from `Investigation` and replaced with `review_events[]`, any in-flight investigation that was saved with the old schema cannot be loaded by code that expects the new schema. Since the store loads from parquet at startup and keeps state in memory, a rolling restart during development is safe — but if the store were persisted to disk between restarts (e.g., investigations serialized to JSON), the old objects would fail Pydantic validation on load.

**Prevention:** The migration must be atomic from the store's perspective. Since the `DataStore` is in-memory and reloads from parquet at startup (parquet contains claim data, not investigation state), all investigation state is ephemeral — there is no disk migration needed. The risk is during the implementation window: if `save_investigation()` uses a JSON file or SQLite as a backing store, that file must be cleared before deploying the new schema. Verify `DataStore` has no persistence path for investigation objects before proceeding.

**Detection:** Check `backend/app/data/loader.py` and `DataStore.save_investigation()` for any file write of investigation state.

### 13. Derived fields must not be stored — only recomputed

**What goes wrong:** `REVIEW-04` introduces a `requires_role_for_next_decision` derived field. If this field is serialized to the datastore and later read back, it may become stale — the stored value can diverge from what the event log actually implies. This creates a split-brain scenario: the UI reads the stale stored value and shows incorrect role gates, while the backend recomputes from the event log and gets a different answer.

**Prevention:** Mark `requires_role_for_next_decision` as a computed `@property` in Pydantic v2 using `model_computed_fields` or as a `@property` on the model. Never persist it. Both UI and backend must derive it fresh from the event log every time. Pydantic v2's `model_serializer` with `exclude` can prevent it from being serialized if it must be a model field.

### 14. `workflow_status` derivation must be deterministic and single-source

**What goes wrong:** `REVIEW-02` splits status into `workflow_status` and `final_disposition`. If the frontend UI derives `workflow_status` by inspecting event types, and the FastAPI backend does the same derivation in its validation logic, any divergence in the derivation algorithm creates inconsistencies. A user action is allowed by the frontend (which uses one algorithm) but rejected by the backend (which uses a different or incorrectly ported algorithm).

**Prevention:** Implement the derivation logic exactly once in Python (`backend/app/domain/review_state.py`). The plan already calls for this file. The TypeScript equivalent in `access-control.ts` must be derived from the same specification — include explicit test cases that cover every state transition for both Python and TypeScript implementations. This is a place where divergence is nearly guaranteed without tests.

### 15. Immutability enforcement for `final_disposition` requires database-level or store-level guard

**What goes wrong:** `REVIEW-09` states final disposition is immutable once set. If only the FastAPI route validates this at the application layer, a future code change or direct datastore manipulation can silently overwrite it. The in-memory `DataStore` has no transaction or constraint mechanism.

**Prevention:** The `update_investigation()` method (or equivalent) in `DataStore` must explicitly check that `final_disposition` is `null` before accepting a write that sets it. Any write that tries to overwrite a non-null `final_disposition` must raise a domain error, not a generic validation error. Log the attempt. Add a test for this guard.

### 16. Actor snapshot fields must be captured at write time, not read time

**What goes wrong:** `REVIEW-10` requires `actor_display_name_snapshot` and `actor_role_snapshot` on every event. If the event model stores only `actor_id` and the snapshot is fetched lazily when reading the event log, it will show the actor's *current* name and role, not what they were at the time of the decision. An admin whose name changed or a user who was promoted to senior_reviewer will appear with the wrong identity in historical audit records.

**Prevention:** The proxy route handler must capture the display name and role from the validated session and pass them in the identity envelope headers. The FastAPI review endpoint must snapshot these values into the event record at write time, never at read time. The `actor_role_snapshot` field in particular is critical for this project because role changes are an explicit admin operation.

---

## Better Auth Specific Pitfalls

### 17. Admin plugin uses `ban` semantics, not `deactivate` semantics — session behavior differs

**What goes wrong:** Better Auth's admin plugin provides `banUser` and `unbanUser`. The `banUser` endpoint revokes all existing sessions, which satisfies ACCESS-04 (immediate session revocation on deactivation). However, "ban" in Better Auth carries connotations of permanent block with optional expiry, and the ban status is stored on the user record. The project uses the term "deactivate/reactivate" to mean reversible removal of access. These are semantically equivalent to the ban mechanism, but the admin console UI must never show "banned" to operators.

**Prevention:** Use `banUser` / `unbanUser` as the underlying mechanism but map the language. Add a Drizzle schema column `is_active` (mirroring the ban state, or derived from it) for clarity in audit records. Alternatively, rely entirely on Better Auth's `banned` field but rename it in all UI display copy.

### 18. `trustedProviders` in account linking creates account takeover risk

**What goes wrong:** The plan sets `trustedProviders: ["google", "microsoft", "email-password"]`. With all three as trusted, if someone creates an account with email/password for `user@company.com`, a social login with the same email from Google will automatically link to that account without verification. This is correct for the intended "same-email" linking policy, but it means: if an attacker gains access to a user's Google account, they automatically gain access to the claims workbench account even if the user never intended to link Google.

**Prevention:** This is a known and documented risk in Better Auth ("Forced linking ... should be used with caution as it may increase the risk of account takeover"). For an internal tool, this is acceptable. The mitigation is the invite-only access model: only pre-approved email addresses can have accounts, so the attack surface is limited. Document this as an accepted risk in the decision log.

### 19. Invite-only model requires disabling the `/sign-up/email` endpoint

**What goes wrong:** Better Auth's `emailAndPassword` plugin enables self-signup by default. If `/sign-up/email` is not disabled, anyone who discovers the auth endpoint can create an account. The project explicitly prohibits public self-signup.

**Prevention:** Use `disabledPaths: ["/sign-up/email"]` in the `betterAuth` config. Also disable `/sign-up/email` via the middleware matcher — even if the endpoint is disabled at the application level, defense-in-depth means the middleware should return 404 for that path rather than a 403 (to avoid advertising the endpoint exists).

### 20. First-admin bootstrap race condition

**What goes wrong:** The bootstrap route (`/api/bootstrap`) creates the first admin user and is then supposed to become unavailable once an admin exists. If two requests hit the bootstrap endpoint simultaneously (e.g., two browser tabs during setup), two admin accounts may be created. More critically, if the "is admin exists" check and the "create admin" write are not atomic, a race yields two admins even with a guard.

**Prevention:** Implement the bootstrap guard as a database transaction or use an application-level mutex. The check `"does any admin exist"` followed by `"create admin"` must be a single atomic operation. In Postgres, this can be done with `INSERT ... WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE role = 'admin')` or by using a unique constraint on a singleton config row. Never do SELECT then INSERT as separate operations.

### 21. Invite acceptance page: user may already have an account with the invited email

**What goes wrong:** If someone is invited to `user@company.com` but already has a Better Auth account (perhaps from a previous invite that was deactivated), the accept-invite flow will attempt to create a new user record and fail with a unique constraint violation. The error will surface as an opaque 500 unless explicitly handled.

**Prevention:** The accept-invite route must check whether a user with the invited email already exists before attempting creation. If the user exists and is active, redirect to sign-in with a message. If the user exists and is banned/deactivated, surface a clear error asking them to contact an admin.

### 22. Drizzle adapter with Neon requires the `neon-http` or `node-postgres` adapter specifically

**What goes wrong:** Better Auth's Drizzle adapter is instantiated as `drizzleAdapter(db, { provider: "pg" })`. The `db` instance must be created with `drizzle-orm/node-postgres` (using `pg.Pool`) for a server environment. Using `drizzle-orm/neon-http` (the Neon HTTP adapter for serverless edge functions) is incompatible with `pg.Pool`-based Better Auth operations in a Node.js server context, and will produce connection errors or hanging requests.

**Prevention:** The plan correctly uses `drizzle-orm/node-postgres` with `pg.Pool`. Use the pooled Neon connection string (ends in `?pgbouncer=true` or uses the `-pooler` hostname) to avoid connection limit exhaustion in the serverless Next.js environment. Set `pool_mode=transaction` in PgBouncer config (Neon default) — this means you cannot use session-level features like prepared statements without disabling them (`prepare: false` in the Pool constructor options).

### 23. Role is stored in Better Auth's `user.role` field, not a separate table — no history

**What goes wrong:** The admin plugin stores a single `role` string on the user record. When a user's role is changed from `reviewer` to `senior_reviewer`, the previous role is overwritten. The audit requirement (ACCESS-03) requires logging role change events, but this history exists only in the application's access audit table — not in Better Auth's tables.

**Prevention:** The access audit table in `schema.ts` must capture both the `from_role` and `to_role` on every role change, sourced from the application layer before the role update is committed. The order must be: read current role → write audit event → update role. If the role update fails, the audit event must be rolled back (use a Postgres transaction wrapping both operations).

---

## SSE Proxy Pitfalls

### 24. Route handler cannot `await` the upstream SSE body without blocking

**What goes wrong:** The current SSE implementation uses a direct `fetch()` in `streamInvestigation()` on the client side, hitting FastAPI directly (via the Next.js rewrite). After the rewrite is replaced with authenticated route handlers, the `/api/claims/[id]/investigate` route handler will receive the SSE request. If the handler does:

```ts
const upstream = await fetch(backendUrl, { ... });
return new Response(await upstream.arrayBuffer(), ...);
```

This waits for the entire stream to buffer before responding. The client gets nothing until the investigation is fully complete, destroying the streaming UX.

**Prevention:** Use `ReadableStream` passthrough: return `new Response(upstream.body, { headers: { "Content-Type": "text/event-stream", ... } })`. This forwards the upstream `ReadableStream` directly to the client without buffering:

```ts
const upstream = await fetch(backendUrl, { method: "POST", ... });
return new Response(upstream.body, {
  status: upstream.status,
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
});
```

This works in Next.js App Router route handlers because they return Web API `Response` objects which support `ReadableStream` bodies natively.

### 25. Vercel/edge function timeout will terminate long SSE streams

**What goes wrong:** If this application is deployed to Vercel, serverless functions have a maximum execution timeout (10 seconds on Hobby, 60 seconds on Pro, 300 seconds on Enterprise). The investigation SSE stream can take longer than the timeout depending on the LLM response. The stream will be terminated mid-flight with no error to the client.

**Prevention:** For this project, the investigation pipeline is LangGraph + LLM, so streaming duration is unpredictable. Ensure the deployment target (if not self-hosted) supports long-lived streaming connections. If deploying to Vercel, enable `maxDuration` in the route segment config. If self-hosted, this is not an issue.

### 26. `Connection: keep-alive` and `Transfer-Encoding: chunked` headers may be stripped by reverse proxies

**What goes wrong:** If Nginx or another reverse proxy sits between the client and the Next.js server, it may buffer responses by default (`proxy_buffering on`). This strips the streaming behavior: the proxy waits for the full response before forwarding, making SSE non-functional.

**Prevention:** For self-hosted deployments with Nginx, set `proxy_buffering off` and `X-Accel-Buffering: no` for SSE endpoints. For the Next.js route handler, set the `X-Accel-Buffering: no` response header explicitly so Nginx respects it.

### 27. Route handler must set correct `Content-Type` — Next.js may add charset suffix

**What goes wrong:** Next.js may auto-append `; charset=utf-8` to the `Content-Type` header. The upstream FastAPI sends `text/event-stream` without a charset. The browser's `EventSource` API strictly requires `text/event-stream` and some implementations reject `text/event-stream; charset=utf-8`. The existing custom fetch-based SSE client in `sse.ts` does not use `EventSource`, so it is less strict — but other clients may be added.

**Prevention:** Explicitly set `"Content-Type": "text/event-stream"` in the proxy response headers and also `"X-Content-Type-Options": "nosniff"`. The existing fetch-based SSE client is tolerant of this, but document it.

### 28. AbortController / client disconnect must propagate upstream to FastAPI

**What goes wrong:** When the browser client navigates away or aborts the investigation, the Next.js route handler's request is cancelled. The `upstream.body` `ReadableStream` should be cancelled automatically, which should close the upstream fetch to FastAPI. However, if the fetch signal is not passed or if the stream is not properly piped, FastAPI continues running the full LangGraph pipeline in the background, wasting LLM tokens and CPU.

**Prevention:** Pass an `AbortSignal` to the upstream fetch in the proxy, derived from the incoming request's signal:

```ts
const upstream = await fetch(backendUrl, {
  signal: request.signal,
  ...
});
```

This ensures that if the client disconnects, the upstream request is aborted.

---

## Security Risks

### 29. Trusted header model is only secure if FastAPI is never directly reachable from the browser

**What goes wrong:** The entire security model rests on the invariant that only Next.js can call FastAPI, and Next.js always attaches validated identity headers plus the shared `INTERNAL_PROXY_SECRET`. If FastAPI is accessible directly (no firewall, exposed port, or misconfigured CORS), any browser or script can send forged `x-user-id: admin` and `x-user-role: admin` headers along with a guessed or stolen `INTERNAL_PROXY_SECRET`.

**Prevention:** In production, FastAPI must bind to `127.0.0.1` (already the default in `config.py` as `API_HOST: str = "127.0.0.1"`) and must never be exposed on a public port. The `INTERNAL_PROXY_SECRET` must be a cryptographically random 256-bit value (32 bytes, base64 encoded), not a human-readable string. Use `secrets.token_urlsafe(32)` in Python to generate it. Rotate it as part of any credential leak response. Include a startup check in FastAPI that validates the secret is set and is of sufficient length.

### 30. The `INTERNAL_PROXY_SECRET` is symmetric — compromise gives full admin access

**What goes wrong:** Because the secret is shared between Next.js and FastAPI, any process that obtains it can forge any identity envelope. If a third service (e.g., a background worker, analytics service) is also given the secret, the attack surface grows. A compromised Next.js environment (e.g., a supply chain attack on a frontend package) would expose both the secret and the ability to call FastAPI as any user including admin.

**Prevention:** Limit who has the secret to exactly two services: Next.js and FastAPI. Do not log it. Rotate it regularly. Use environment-specific secrets (dev secret, prod secret). Consider using HMAC signing of the identity envelope (Next.js signs the `user_id + role + timestamp` payload; FastAPI verifies the signature) to add replay protection and make stolen secrets less useful. However, HMAC adds complexity — for an internal tool behind a firewall, the shared secret is an acceptable tradeoff if documented.

### 31. Role header injection if the proxy does not strip incoming actor headers from the browser

**What goes wrong:** A sophisticated user could add `x-user-role: admin` to their browser request before it reaches the Next.js route handler. If the proxy handler blindly spreads all incoming request headers onto the upstream fetch (e.g., `headers: Object.fromEntries(request.headers)`), the attacker's header would be forwarded to FastAPI. The browser header and the proxy's own injected header would both be present, and depending on how FastAPI reads them (first occurrence? last?), the attacker's value might win.

**Prevention:** The proxy handler must explicitly delete any incoming identity headers from the browser request before constructing the upstream headers. Never spread incoming headers. Build the upstream header object from scratch:

```ts
const upstreamHeaders = new Headers();
upstreamHeaders.set("x-internal-proxy-secret", proxySecret);
upstreamHeaders.set("x-user-id", session.user.id);
upstreamHeaders.set("x-user-role", session.user.role);
// ... only include what FastAPI needs
```

### 32. Session staleness window: role changes are not immediately reflected in active sessions

**What goes wrong:** Better Auth sessions are cached in cookies. When an admin changes a user's role via the admin console, the role change is committed to the database. However, the user's existing session cookie still carries (or the session record stores) the old role. If the role is read from the cookie/session at request time, the user continues to act under the old role until their session is refreshed.

**Prevention:** The `requireSession()` helper must always call `auth.api.getSession()` which fetches the session from the database, not from a cached in-memory store. Better Auth by default validates sessions against the database on each call, so the returned `session.user.role` reflects the current database value. Do not cache the session object server-side between requests. Confirm that Better Auth's `getSession` re-reads the user record (including role) on every call rather than relying on session table data that may be stale.

### 33. CSRF is disabled but `/api/auth/*` routes must not accept cross-origin form submissions

**What goes wrong:** The project disables `disableCSRFCheck: false` (CSRF is enabled by default). This is correct. However, the `trustedOrigins` configuration must be tight. If `trustedOrigins` accidentally includes a wildcard that matches attacker-controlled domains (e.g., `"https://*.com"` instead of `"https://*.company.com"`), CSRF protection is bypassed.

**Prevention:** Set `trustedOrigins` to only the exact origins where the frontend is served. In development, this is `["http://localhost:3000"]`. In production, it is the single production domain. Do not use wildcards unless the subdomain pattern is specific to the company domain.

---

## Phase Mapping

| Pitfall | Phase / Task | Mitigation Timing |
|---------|-------------|-------------------|
| #1 Redirect loop on `/api/auth/*` | Task 2 (middleware.ts) | Before any route handlers are created |
| #2 `getSessionCookie` config mismatch | Task 1 (auth.ts) + Task 2 | Synchronize cookie config in same step |
| #3 Optimistic check false security | Task 2 + Task 3 | Enforce in every route handler |
| #4 Edge runtime vs. Node.js | Task 2 | Declare `runtime: "nodejs"` in middleware config |
| #5 Middleware matcher syntax | Task 2 | Test matcher before deploying auth |
| #6 Header case sensitivity | Task 3 (proxy + FastAPI auth.py) | Use lowercase consistently |
| #7 Content-type forwarding | Task 3 (backend-proxy.ts) | Build explicit header allowlist |
| #8 `host` header forwarding | Task 3 (backend-proxy.ts) | Exclude `host` from forwarded headers |
| #9 `Authorization` header collision | Task 3 (backend-proxy.ts) | Strip `authorization` before forwarding |
| #10 Redirect following in proxy | Task 3 (backend-proxy.ts) | Set `redirect: "manual"` |
| #11 SSE buffering in proxy | Task 3 (investigate route handler) | Separate SSE proxy implementation |
| #12 In-flight write data loss | Task 4 (review schema) | Verify DataStore has no persisted state before cutover |
| #13 Derived fields stored stale | Task 4 (domain/review_state.py) | Use computed fields, never serialize derived state |
| #14 Derivation algorithm divergence | Task 4 + Task 5 | Shared spec + cross-language tests |
| #15 Immutability not enforced at store | Task 4 (DataStore.update_investigation) | Add guard check + test |
| #16 Actor snapshot at read vs. write | Task 4 (review route) | Capture snapshot from session at write time |
| #17 `ban` vs. `deactivate` language | Task 1 + Task 5 (admin console) | UI copy, map to Better Auth ban internally |
| #18 Trusted providers account takeover | Task 1 (auth.ts) | Accept as risk, document in decision log |
| #19 Self-signup not disabled | Task 1 (auth.ts) | Add `disabledPaths: ["/sign-up/email"]` |
| #20 Bootstrap race condition | Task 2 (bootstrap route) | Atomic DB operation |
| #21 Invite with existing account | Task 2 (accept-invite page) | Check existence before create |
| #22 Neon/Drizzle adapter mismatch | Task 1 (db/client.ts) | Use `node-postgres` + pooled connection string |
| #23 Role history in Better Auth | Task 1 + Task 5 | Audit table captures from/to before update |
| #24 SSE proxy buffering | Task 3 (investigate route) | `ReadableStream` passthrough, not `.arrayBuffer()` |
| #25 Serverless timeout for SSE | Task 3 | Add `maxDuration` or self-host |
| #26 Nginx buffering for SSE | Deployment configuration | Set `proxy_buffering off` |
| #27 Content-Type charset | Task 3 (investigate route) | Explicit `text/event-stream` header |
| #28 AbortController propagation | Task 3 (investigate route) | Pass `request.signal` to upstream fetch |
| #29 FastAPI direct browser access | Task 3 + deployment | `API_HOST=127.0.0.1`, firewall rule |
| #30 Shared secret compromise | Task 3 | Cryptographically random secret, env-specific |
| #31 Role header injection from browser | Task 3 (backend-proxy.ts) | Build upstream headers from scratch, never spread |
| #32 Session staleness on role change | Task 3 + Task 5 | Always call `auth.api.getSession()`, no in-process cache |
| #33 CSRF trustedOrigins wildcard | Task 1 (auth.ts) | Exact origins only, no broad wildcards |

---

## Source Confidence

| Area | Confidence | Basis |
|------|------------|-------|
| Better Auth middleware behavior | HIGH | Context7 official docs, explicit warnings in Better Auth's own Next.js integration guide |
| SSE proxy passthrough pattern | HIGH | Web API / Fetch specification + Next.js App Router Response docs |
| Trusted header security model | HIGH | Direct codebase inspection (config.py, main.py, next.config.ts) + security first principles |
| Event log migration risks | HIGH | Direct codebase inspection of investigation.py schema |
| Better Auth admin plugin / invite | HIGH | Context7 official docs with explicit API definitions |
| Neon/Drizzle adapter compatibility | MEDIUM | Official Better Auth adapter docs (pg.Pool focus, Neon-specific guidance sparse) |
| Vercel timeout / Nginx SSE | MEDIUM | Known deployment patterns, not verified against specific Next.js 16 docs |

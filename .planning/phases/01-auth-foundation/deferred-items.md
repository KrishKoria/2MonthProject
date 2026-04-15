# Deferred Items

- 2026-04-15: Concurrent out-of-scope work observed in `frontend/src/lib/access-types.ts` and neighboring auth-foundation commits (`525808d`, plan `01-03`). Left untouched for the owning executor.
- 2026-04-15 (01-06): Pre-existing test failure in `frontend/src/lib/sse.test.ts` — "streamInvestigation defaults to NEXT_PUBLIC_API_BASE_URL". Root cause: bun:test module import caching prevents `NEXT_PUBLIC_API_BASE_URL` env var from being picked up when the module is imported in a prior test in the same file. Not caused by 01-06 changes; present before this plan. Needs investigation in a future plan.

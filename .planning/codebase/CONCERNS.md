# Codebase Concerns

**Analysis Date:** 2026-04-15

## Tech Debt

**Duplicated investigation orchestration paths:**
- Issue: The live SSE endpoint manually sequences triage, evidence, persistence, and rationale in `backend/app/api/routes/investigation.py`, while `backend/app/orchestrator/graph.py` defines a separate LangGraph flow described as the canonical pipeline.
- Files: `backend/app/api/routes/investigation.py`, `backend/app/orchestrator/graph.py`, `backend/tests/test_orchestrator.py`
- Impact: Behavior can drift between the route that users hit and the graph that tests exercise. A change can pass graph-level tests while the shipped SSE path still behaves differently.
- Fix approach: Pick one execution path as the runtime source of truth. Either have the route delegate to the compiled graph or reduce the graph to a thin wrapper around the route-level orchestration logic.

**Manual frontend/backend schema mirroring without runtime validation:**
- Issue: The frontend keeps a handwritten mirror of backend Pydantic models in `frontend/src/lib/types.ts` with an explicit "Keep in sync" comment, and `frontend/src/lib/api.ts` trusts JSON responses via `body as T`.
- Files: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `backend/app/data/schemas/claims.py`, `backend/app/data/schemas/evidence.py`, `backend/app/data/schemas/investigation.py`
- Impact: Contract drift is easy to introduce and hard to catch. A backend shape change can compile cleanly and still break the UI at runtime.
- Fix approach: Generate shared types from backend schemas or introduce runtime validation at the frontend boundary with a schema library and fail-fast parsing.

**Eager-loaded NCCI data is not reused by the evidence tooling:**
- Issue: Startup loads `store.ncci_edits_df` in `backend/app/data/loader.py`, but `backend/app/orchestrator/tools.py` ignores that store data and constructs a fresh `NCCIEngine()` that lazily reloads the CSV from disk.
- Files: `backend/app/data/loader.py`, `backend/app/orchestrator/tools.py`, `backend/app/evidence/ncci_engine.py`
- Impact: The codebase pays the complexity cost of both startup loading and per-request loading, while only one path is actually used.
- Fix approach: Rework `ncci_lookup` to use `DataStore.ncci_edits_df` or inject a long-lived `NCCIEngine` instance from startup state.

## Known Bugs

**Human decisions do not fully survive a process restart:**
- Symptoms: A saved investigation record survives restart, but the underlying claim status can revert to the original Parquet value because only investigations are persisted.
- Files: `backend/app/data/loader.py`, `backend/app/api/routes/investigation.py`, `backend/tests/test_api.py`, `backend/tests/test_data_loader.py`
- Trigger: Submit a decision through `PATCH /api/claims/{claim_id}/investigation`, restart the backend, then reload the same claim.
- Workaround: Re-derive status from the persisted investigation record or rebuild the processed claims artifact manually.

**Frontend loses useful backend error details:**
- Symptoms: The UI often shows generic HTTP status text instead of the real backend failure reason.
- Files: `frontend/src/lib/api.ts`, `frontend/src/app/claims/[id]/page.tsx`, `frontend/src/components/investigation/HumanReviewDesk.tsx`, `backend/app/main.py`, `backend/app/api/routes/investigation.py`
- Trigger: Any backend error that returns `{"error": {"message": ...}}` or FastAPI `detail` instead of a top-level `message` field.
- Workaround: Inspect browser network responses or backend logs; the current frontend client does not consistently surface the nested message.

## Security Considerations

**No authentication or authorization on read/write claim endpoints:**
- Risk: Any caller that can reach the backend can list claims, fetch investigations, trigger AI runs, and submit final decisions.
- Files: `backend/app/main.py`, `backend/app/api/dependencies.py`, `backend/app/api/routes/claims.py`, `backend/app/api/routes/investigation.py`, `backend/app/api/routes/analytics.py`, `backend/app/api/routes/ncci.py`, `frontend/src/components/investigation/HumanReviewDesk.tsx`
- Current mitigation: Not detected. The backend exposes all routes directly and the decision path records `investigator_id=None`.
- Recommendations: Add real authn/authz middleware, require an authenticated reviewer identity on mutations, and reject unauthorized reads and writes before business logic runs.

**Internal exception details are streamed back to the client:**
- Risk: The investigation stream emits `str(exc)` and upstream LLM error strings directly to the browser, which can leak infrastructure details and model/backend failure text.
- Files: `backend/app/api/routes/investigation.py`, `backend/app/orchestrator/rationale.py`, `frontend/src/lib/sse.ts`
- Current mitigation: Standard JSON routes have a generic 500 handler in `backend/app/main.py`, but the SSE path bypasses that and sends raw messages.
- Recommendations: Replace raw exception text with stable public error codes, log the detailed exception server-side, and map known failures to sanitized user-facing messages.

**Credential-friendly CORS is enabled on a fully open API surface:**
- Risk: `allow_credentials=True` is enabled globally while the API has no auth boundary. If cookies or other credentials are introduced later, the current posture increases the chance of cross-origin misuse.
- Files: `backend/app/main.py`, `backend/app/config.py`, `backend/.env.example`
- Current mitigation: Origin allow-list comes from `CORS_ALLOW_ORIGINS`, but there is no paired CSRF or session protection flow.
- Recommendations: Keep credentialed CORS disabled until session-based auth exists, then add CSRF/session protections alongside least-privilege origin configuration.

## Performance Bottlenecks

**Claim listing is built from whole-DataFrame copies and merges per request:**
- Problem: `GET /api/claims` copies the claims table, applies Python/pandas filtering, then merges scores and sorts in-memory for every request.
- Files: `backend/app/api/routes/claims.py`, `backend/app/data/loader.py`
- Cause: The application uses a process-local pandas store instead of indexed queryable storage.
- Improvement path: Move claims/risk data to a database or columnar query engine, or pre-index the in-memory data structures and avoid full-frame copies for interactive endpoints.

**NCCI lookups reload the CSV in the live request path:**
- Problem: `tools.ncci_lookup()` creates a new `NCCIEngine()` by default, and `NCCIEngine.edits_df` loads `practitioner_ptp_edits.csv` on first use for that instance.
- Files: `backend/app/orchestrator/tools.py`, `backend/app/evidence/ncci_engine.py`
- Cause: The evidence tool does not reuse startup state and performs file-backed setup during investigation runs.
- Improvement path: Initialize the engine once at startup or query against `DataStore.ncci_edits_df`.

**Investigation latency depends on live OpenAI and Chroma calls in the foreground request path:**
- Problem: The evidence+rationale pipeline performs `rag_retrieval()` and streamed OpenAI chat completion during the same HTTP request that powers the UI review flow.
- Files: `backend/app/orchestrator/tools.py`, `backend/app/evidence/rag_retriever.py`, `backend/app/evidence/rag_embeddings.py`, `backend/app/orchestrator/rationale.py`, `backend/app/api/routes/investigation.py`
- Cause: Retrieval and synthesis are synchronous request-path work with no queue, cache, or backpressure boundary.
- Improvement path: Cache evidence retrieval where possible, precompute embeddings/index health, and move long-running investigation work behind a job queue or worker so the API is not the only execution boundary.

## Fragile Areas

**Investigation streaming has no automatic fallback to the provided polling endpoint:**
- Files: `frontend/src/lib/sse.ts`, `frontend/src/components/investigation/InvestigationConsole.tsx`, `backend/app/api/routes/investigation.py`
- Why fragile: The backend exposes `GET /api/claims/{claim_id}/investigation/status`, but the UI does not switch to polling when SSE fails. A transient network interruption leaves the screen in an error state even though work may have completed server-side.
- Safe modification: Preserve both streaming and polling semantics together. Any change to the SSE contract should include a client fallback path that checks stored status before surfacing a terminal error.
- Test coverage: `backend/tests/test_api.py` covers the status endpoint, and `frontend/src/lib/sse.test.ts` covers frame parsing, but there is no end-to-end test proving recovery from mid-stream failure.

**Decision records have a visible audit-field placeholder that is never populated:**
- Files: `backend/app/api/routes/investigation.py`, `backend/app/data/schemas/investigation.py`, `frontend/src/components/investigation/HumanReviewDesk.tsx`
- Why fragile: The UI renders a chain-of-custody field, but the backend always writes `HumanDecision(... investigator_id=None)`. The screen implies reviewer attribution that the system does not actually capture.
- Safe modification: Add authenticated reviewer context first, then thread it through the mutation handler and UI. Do not present reviewer provenance as complete until the backend enforces it.
- Test coverage: `backend/tests/test_api.py` asserts that `investigator_id` is `None`; there is no test for authenticated attribution because the feature does not exist.

**The largest user-path logic is concentrated in a single client component:**
- Files: `frontend/src/components/investigation/InvestigationConsole.tsx`, `frontend/src/components/investigation/HumanReviewDesk.tsx`, `frontend/src/lib/investigation.ts`
- Why fragile: `InvestigationConsole.tsx` owns stream lifecycle, timing, stage inference, halt/error UX, and snapshot application. A change in one stage can regress another because the state machine is spread across local state setters rather than a smaller reducer or shared state abstraction.
- Safe modification: Extract a dedicated investigation state machine or hook before making larger behavior changes, and add interaction-level tests around restart, cancel, error, and re-run flows.
- Test coverage: `frontend/src/components/investigation/InvestigationConsole.test.tsx` exists, but there is no browser-level test of the full streamed workflow against the backend.

## Scaling Limits

**Process-local analytics and investigation state:**
- Current capacity: One backend process owns in-memory pandas DataFrames plus a local Parquet/Chroma working set under `data/`.
- Limit: Horizontal scaling will diverge state because claim status changes and investigations are not coordinated through a shared transactional store.
- Scaling path: Move mutable state to a shared database, store artifacts in durable external storage, and make the API stateless aside from request-scoped caches.

**Foreground AI workflow execution:**
- Current capacity: Each investigation request holds open an HTTP stream while deterministic evidence, retrieval, and OpenAI synthesis run inline.
- Limit: Throughput will collapse under concurrent investigations because every run consumes request time, network dependency budget, and local CPU/memory without queueing discipline.
- Scaling path: Convert investigations into queued jobs with streamed progress updates backed by durable status storage.

## Dependencies at Risk

**OpenAI API:**
- Risk: `backend/app/orchestrator/rationale.py` and `backend/app/evidence/rag_embeddings.py` both depend on OpenAI availability and credentials in the live request path.
- Impact: Investigation runs can fail or stall when credentials are missing, upstream latency spikes, or rate limits/errors occur.
- Migration plan: Introduce provider abstraction, circuit-breaking, and cached/offline fallback behavior before treating the current path as production-safe.

**Local Chroma persistence:**
- Risk: Retrieval depends on a local Chroma collection under `data/chroma` and a populated policy corpus, but readiness is only validated informally.
- Impact: Empty or unhealthy local vector state degrades evidence quality and can force manual-review halts.
- Migration plan: Add explicit startup/readiness checks, monitoring for collection size/health, and a durable managed retrieval backend if the system needs multi-instance deployment.

## Missing Critical Features

**Authenticated reviewer workflow:**
- Problem: The product records claim decisions without identity, session, or permission checks.
- Blocks: Real auditability, least-privilege access, and any production-like operational rollout.

**Automated CI gate:**
- Problem: A repository CI pipeline is not detected, and `backend/README.md` describes `backend/scripts/validate_prompt.py` as a manual pre-demo gate rather than an automated check.
- Blocks: Reliable regression detection for runtime contracts, performance, and AI-path behavior before merges.

**Durable persistence for claim state:**
- Problem: The only durable write path is `investigations.parquet`; mutable claim state remains an in-memory mutation on `claims_df`.
- Blocks: Trustworthy restart behavior and multi-instance consistency.

## Test Coverage Gaps

**Restart behavior after a reviewer decision:**
- What's not tested: Persistence of `claim_status` after `PATCH /api/claims/{claim_id}/investigation` and subsequent process restart.
- Files: `backend/app/data/loader.py`, `backend/app/api/routes/investigation.py`, `backend/tests/test_api.py`, `backend/tests/test_data_loader.py`
- Risk: A user can believe a claim was accepted/rejected/escalated, then see the claim revert after restart with no automated test catching it.
- Priority: High

**Real end-to-end frontend/backend contract validation:**
- What's not tested: A browser-level run that loads `/claims/[id]`, streams an investigation, handles an error, and submits a decision against the live FastAPI contract.
- Files: `frontend/src/lib/api.test.ts`, `frontend/src/lib/sse.test.ts`, `frontend/src/components/investigation/InvestigationConsole.test.tsx`, `backend/tests/test_api.py`
- Risk: The repository has unit and route tests, but contract mismatches across the actual UI flow can still ship unnoticed.
- Priority: High

**Production-like latency and dependency behavior:**
- What's not tested: Performance under real OpenAI/Chroma latency and degraded upstream conditions.
- Files: `backend/tests/test_performance.py`, `backend/scripts/validate_prompt.py`, `backend/app/orchestrator/rationale.py`, `backend/app/evidence/rag_retriever.py`
- Risk: The only explicit latency test mocks both evidence and LLM work, so the published timing expectations are not proven from the codebase.
- Priority: Medium

---

*Concerns audit: 2026-04-15*

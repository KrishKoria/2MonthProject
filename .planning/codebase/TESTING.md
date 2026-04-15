# Testing Patterns

**Analysis Date:** 2026-04-15

## Test Framework

**Frontend runner:**
- Bun test runner via `bun:test`.
- Representative files: `frontend/src/lib/api.test.ts`, `frontend/src/lib/sse.test.ts`, `frontend/src/components/investigation/InvestigationConsole.test.tsx`, `frontend/next.config.test.ts`.
- Type support for the runner is declared in `frontend/src/types/bun-test.d.ts`.

**Backend runner:**
- `pytest` with `pytest-asyncio` and `pytest-cov`, configured in `backend/pyproject.toml`.
- `backend/pyproject.toml` sets `asyncio_mode = "auto"`, `testpaths = ["tests"]`, and `pythonpath = ["."]`.

**Assertion Library:**
- Frontend uses Bun's built-in `expect(...)` matchers from `bun:test`.
- Backend uses plain `assert`, `pytest.raises(...)`, and `pytest.approx(...)`.

**Run Commands:**
```bash
cd frontend && bun test                         # Frontend test suite
cd frontend && bun run lint && bun run build    # Frontend verification from `frontend/README.md`
cd backend && uv run pytest                     # Backend test suite
cd backend && uv run pytest tests/test_api.py -q  # Targeted backend test file
cd backend && uv run pytest --cov=app --cov-report=term-missing  # Coverage command referenced in `specs/001-claims-investigation-assistant/quickstart.md`
```

## Test File Organization

**Location:**
- Frontend tests are co-located with the modules they exercise, for example `frontend/src/lib/claims-query.ts` with `frontend/src/lib/claims-query.test.ts` and `frontend/src/components/claims/CodeChip.tsx` with `frontend/src/components/claims/CodeChip.test.tsx`.
- Frontend also keeps config-level tests at the package root, for example `frontend/next.config.test.ts`.
- Backend tests live in a dedicated `backend/tests/` directory.

**Naming:**
- Frontend uses `*.test.ts` and `*.test.tsx`.
- Backend uses `test_*.py`.

**Structure:**
```text
frontend/
  src/lib/*.test.ts
  src/components/**/*.test.tsx
  next.config.test.ts

backend/
  tests/test_api.py
  tests/test_orchestrator.py
  tests/test_model.py
  tests/test_performance.py
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, test } from "bun:test";

describe("claims query helpers", () => {
  test("clamps invalid search params back to safe defaults", async () => {
    const mod = await import("./claims-query");
    const query = mod.claimsQueryFromSearchParams({ page: "-9", sort_dir: "sideways" });
    expect(query).toEqual({
      page: 1,
      page_size: 25,
      sort_by: "risk_score",
      sort_dir: "desc",
    });
  });
});
```

```python
@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "DATA_DIR", _workspace_data_dir("api"))
    app.dependency_overrides[get_data_store] = lambda: _make_store()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_list_claims_returns_paginated_envelope(client):
    res = client.get("/api/claims")
    assert res.status_code == 200
    assert res.json()["data"]["total"] == 3
```

**Patterns:**
- Frontend loads the module under test inside each case with `await import("./module")`. This avoids fragile global setup and makes environment overrides local to the test. See `frontend/src/lib/api.test.ts` and `frontend/src/lib/claims-query.test.ts`.
- Frontend component tests favor static HTML rendering with `renderToStaticMarkup(...)` from `react-dom/server` and then assert on text or markup fragments. See `frontend/src/components/investigation/InvestigationConsole.test.tsx` and `frontend/src/components/guidance/HelpTooltip.test.tsx`.
- Backend tests use local helper builders such as `_make_store`, `_sample_investigation`, `_claim`, and `_store` inside each file instead of a shared fixture library. See `backend/tests/test_api.py`, `backend/tests/test_orchestrator.py`, and `backend/tests/test_performance.py`.
- Async backend behavior is covered directly with `@pytest.mark.asyncio` and async iteration, especially in `backend/tests/test_orchestrator.py` and `backend/tests/test_data_loader.py`.

## Mocking

**Framework:** native patching, not a dedicated mocking library

**Patterns:**
```typescript
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input) => {
  capturedUrl = String(input);
  return new Response(streamFromChunks([]), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}) as typeof fetch;
```

```python
monkeypatch.setattr(
    investigation_routes,
    "run_evidence",
    lambda state, data_store: {
        "investigation_status": "evidence_complete",
        "evidence_results": {"policy_citations": [], "sources_consulted": []},
    },
)
```

**What to Mock:**
- Frontend mocks `fetch`, `window`, and environment variables directly in the test body. See `frontend/src/lib/api.test.ts` and `frontend/src/lib/sse.test.ts`.
- Backend uses `monkeypatch.setattr(...)` to stub route dependencies, OpenAI/RAG calls, NCCI engines, and persistence functions. See `backend/tests/test_api.py`, `backend/tests/test_orchestrator.py`, `backend/tests/test_rag_embeddings.py`, and `backend/tests/test_rules_baseline.py`.
- FastAPI integration tests override dependencies through `app.dependency_overrides` rather than constructing alternate app instances. See `backend/tests/test_api.py` and `backend/tests/test_performance.py`.

**What NOT to Mock:**
- Frontend render tests usually do not mock component internals; they render the full component tree to static markup and assert the visible output.
- Backend tests often keep real `DataStore`, `Investigation`, and Pydantic model validation in play, especially when the contract itself is under test.

## Fixtures and Factories

**Test Data:**
```python
def _sample_investigation(claim_id: str = "CLM-0001") -> Investigation:
    return Investigation(
        claim_id=claim_id,
        investigation_status=InvestigationStatus.COMPLETE,
        triage=TriageResult(...),
        evidence=EvidenceEnvelope(...),
        rationale=RationaleResult(...),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
```

```typescript
const baseInvestigation = {
  claim_id: "CLM-100",
  triage: null,
  evidence: null,
  rationale: null,
  human_decision: null,
  created_at: "2026-04-13T00:00:00Z",
  updated_at: "2026-04-13T00:00:00Z",
};
```

**Location:**
- Backend fixtures are local helper functions within each test file, not shared through `conftest.py`.
- Frontend test data is usually inline object literals plus small helpers like `streamFromChunks(...)` in `frontend/src/lib/sse.test.ts`.
- Temporary backend persistence paths are generated per test with helpers such as `_workspace_data_dir(...)` in `backend/tests/test_api.py` and `backend/tests/test_data_loader.py`.

## Coverage

**Requirements:** target exists but is not enforced automatically

- `specs/001-claims-investigation-assistant/tasks.md` calls for `>=80%` line coverage on key backend areas.
- `backend/pyproject.toml` installs `pytest-cov`, but no `fail_under` threshold is configured.
- Frontend has no configured coverage tooling or threshold in `frontend/package.json`.
- `backend/scripts/validate_prompt.py` is explicitly documented in `backend/README.md` as a manual pre-demo gate and not part of automated test execution.

**View Coverage:**
```bash
cd backend && uv run pytest --cov=app --cov-report=term-missing
```

## Test Types

**Frontend unit/render tests:**
- Focus on pure helpers and static render output.
- Examples: `frontend/src/lib/claims-query.test.ts`, `frontend/src/lib/investigation.test.ts`, `frontend/src/components/claims/CodeChip.test.tsx`.

**Backend unit tests:**
- Cover deterministic ML, RAG, and orchestration helpers with direct function calls and monkeypatching.
- Examples: `backend/tests/test_features.py`, `backend/tests/test_model.py`, `backend/tests/test_retriever.py`, `backend/tests/test_rules_baseline.py`.

**Backend integration tests:**
- Exercise HTTP routes and SSE streams via `fastapi.testclient.TestClient`.
- Examples: `backend/tests/test_api.py`, `backend/tests/test_api_ndarray_regression.py`, `backend/tests/test_performance.py`.

**Performance tests:**
- `backend/tests/test_performance.py` verifies latency targets for the mocked investigation pipeline.

**E2E Tests:**
- Not detected. There is no Playwright, Cypress, or browser automation config in `frontend/`.

## Common Patterns

**Async Testing:**
```python
@pytest.mark.asyncio
async def test_stream_rationale_handles_llm_exception():
    client = _fake_client([], exc=RuntimeError("network down"))
    events = [event async for event in rationale_module.stream_rationale(_rationale_state(), client=client)]
    assert events[-1]["type"] == "error"
```

```typescript
await new Promise<void>((resolve, reject) => {
  mod.streamInvestigation("CLM-100", {
    onTriage: () => seenEvents.push("triage"),
    onComplete: () => seenEvents.push("complete"),
    onNetworkError: reject,
    onClose: resolve,
  });
});
```

**Error Testing:**
```python
with pytest.raises(ValueError, match="SHAP invariant residual"):
    pipeline_module.assert_shap_invariant(...)
```

```typescript
expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Approve[\s\S]*?<\/button>/);
```

**Contract Verification:**
- Backend tests assert envelope shape, HTTP status, and persisted model shape rather than raw implementation details. See `backend/tests/test_api.py`.
- Frontend tests assert user-facing strings and serialized URL/query behavior, not implementation-private state. See `frontend/src/lib/claims-query.test.ts` and `frontend/src/components/investigation/InvestigationConsole.test.tsx`.

## Coverage Gaps

**Frontend gaps:**
- No direct tests were found for route entry files `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`, `frontend/src/app/claims/page.tsx`, or `frontend/src/app/claims/[id]/page.tsx`.
- Dashboard presentation components in `frontend/src/components/dashboard/AblationTable.tsx`, `frontend/src/components/dashboard/ModelMetricsCard.tsx`, and `frontend/src/components/dashboard/PerAnomalyRecallCard.tsx` have no adjacent tests.
- `frontend/src/components/claims/ClaimsExplorer.tsx` and `frontend/src/components/investigation/HumanReviewDesk.tsx` currently rely on indirect coverage at best; no dedicated `*.test.tsx` files were found.

**Backend gaps:**
- Operational scripts under `backend/scripts/` are not part of `pytest`; `backend/scripts/validate_prompt.py` is explicitly manual and the other data/model scripts have no matching automated tests.
- Core app startup and middleware behavior in `backend/app/main.py` is exercised indirectly through API tests, but there is no dedicated test file for middleware headers and exception handlers as isolated units.
- Support modules such as `backend/app/api/dependencies.py` and `backend/app/utils/sse.py` have no direct test files.
- `backend/app/ml/pipeline.py` is referenced through model tests, but no dedicated `backend/tests/test_pipeline.py` exists.

## Process-Level Quality Rules

**Project-local skills:**
- `.claude/skills/speckit-superb-tdd/SKILL.md` establishes TDD as the expected implementation workflow.
- `.claude/skills/speckit-superb-verify/SKILL.md` requires fresh verification evidence before work is considered done.
- `.claude/skills/reviewing-fullstack/SKILL.md` and `.agents/skills/reality-check/SKILL.md` bias the repo toward skeptical, evidence-backed review rather than superficial passing checks.
- New tests should match that posture: prove behavior at the boundary and document uncovered manual gates explicitly.

---

*Testing analysis: 2026-04-15*

# Features Research: Append-Only Review Workflow

**Project:** Claims Investigation Workbench — Milestone 1 (Auth + Review Hierarchy)
**Researched:** 2026-04-15
**Scope:** REVIEW-01 through REVIEW-10 and UI-01 through UI-03 from PROJECT.md

---

## Event Sourcing Pattern (Python/Pydantic v2)

### Recommended data model shape

The cleanest Pydantic v2 pattern for an append-only event log with derived state uses three
cooperating elements: immutable event/comment models, a mutable container that holds the
append-only lists, and `@computed_field` properties that derive current state from those lists
without storing the derived values themselves.

**Core models:**

```python
from __future__ import annotations
from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal
from pydantic import BaseModel, Field, computed_field

class EventType(StrEnum):
    ACCEPTED   = "accepted"
    REJECTED   = "rejected"
    ESCALATED  = "escalated"

class WorkflowStatus(StrEnum):
    PENDING_REVIEW        = "pending_review"
    PENDING_SENIOR_REVIEW = "pending_senior_review"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    CLOSED                = "closed"

class FinalDisposition(StrEnum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"

class RequiredRole(StrEnum):
    REVIEWER        = "reviewer"
    SENIOR_REVIEWER = "senior_reviewer"
    NONE            = "none"

class ReviewEvent(BaseModel):
    model_config = {"frozen": True}   # immutable once created

    event_type: EventType
    actor_user_id: str
    actor_display_name_snapshot: str
    actor_role_snapshot: str
    notes: str                         # non-empty enforced at route layer
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CaseComment(BaseModel):
    model_config = {"frozen": True}   # immutable once created

    actor_user_id: str
    actor_display_name_snapshot: str
    actor_role_snapshot: str
    body: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Investigation model with computed state:**

```python
class Investigation(BaseModel):
    claim_id: str
    investigation_status: InvestigationStatus = InvestigationStatus.PENDING
    triage: TriageResult | None = None
    evidence: EvidenceEnvelope | None = None
    rationale: RationaleResult | None = None
    review_events: list[ReviewEvent] = Field(default_factory=list)
    case_comments: list[CaseComment] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @computed_field
    @property
    def workflow_status(self) -> WorkflowStatus:
        return derive_workflow_status(self.investigation_status, self.review_events)

    @computed_field
    @property
    def final_disposition(self) -> FinalDisposition | None:
        return derive_final_disposition(self.review_events)

    @computed_field
    @property
    def requires_role_for_next_decision(self) -> RequiredRole:
        return derive_required_role(self.workflow_status)
```

### Key design choices

- `model_config = {"frozen": True}` on `ReviewEvent` and `CaseComment` makes individual events
  truly immutable. Python will raise `ValidationError` if code tries to mutate a field.
- `@computed_field` (Pydantic v2, introduced in v2.0) marks properties as part of the
  serialized output. `model_dump(mode="json")` will include them automatically. This is the
  correct replacement for v1's `@validator` with `always=True`. (Confidence: HIGH — confirmed
  in Pydantic v2 docs.)
- Do NOT use `model_validator(mode="after")` for these fields. `model_validator` is best for
  cross-field consistency checks, not derivation that needs to appear in serialized output.
  `@computed_field` is explicit about intent and round-trips cleanly.
- Append is the only mutation: `investigation.review_events.append(event)`. The `Investigation`
  object itself is not frozen because its lists and `updated_at` need to change.

### Confidence: HIGH

Pattern verified against Pydantic v2 official docs. `computed_field` is stable since v2.0.

---

## Persistence Strategy

### Current situation

The DataStore already handles investigations via `_persist_investigations()` which serializes
to Parquet using `model_dump(mode="json")`. This works for flat scalar fields. Switching to
Parquet for nested lists (review_events, case_comments) introduces schema drift problems:
Parquet infers column types at write time, so an empty list on first write produces a different
schema than a populated list on the next write, causing read failures on restart.

### Recommended approach: JSON file persistence

Replace the investigations Parquet file with a single JSON file per the plan's hint.

```python
def _persist_investigations(self) -> None:
    output_path = settings.scores_dir / "investigations.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(".json.tmp")

    payload = {
        claim_id: inv.model_dump(mode="json")
        for claim_id, inv in self.investigations.items()
    }
    temp_path.write_text(json.dumps(payload, default=str), encoding="utf-8")
    os.replace(temp_path, output_path)  # atomic on same filesystem
```

Loading:

```python
def _load_investigations(path: Path) -> dict[str, Investigation]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {
        claim_id: Investigation.model_validate(record)
        for claim_id, record in raw.items()
    }
```

### Why JSON over Parquet here

- `model_dump(mode="json")` produces a plain dict; `json.dumps` serializes it exactly. No
  schema inference problems with nested lists.
- `Investigation.model_validate(record)` reconstructs the full object including nested
  `review_events` and `case_comments` lists with proper types.
- `os.replace(temp, final)` gives the same atomic-swap durability guarantee the current
  Parquet implementation already uses.
- The existing `_load_investigations` function signature and DataStore API stay the same —
  only the file extension and format change.

### Backward compat for old Parquet records

Load the old Parquet file once if it exists, migrate records (set `review_events=[]` and
`case_comments=[]` if missing), write JSON, then ignore the old Parquet going forward. One-time
migration on startup.

```python
if old_parquet.exists() and not json_path.exists():
    old = _load_investigations_parquet(old_parquet)
    # old records have human_decision, not review_events
    migrated = {k: _migrate_legacy(v) for k, v in old.items()}
    _write_investigations_json(json_path, migrated)
```

### Confidence: HIGH

Pattern matches existing DataStore idioms. JSON persistence is simpler and more correct for
nested Pydantic models than Parquet.

---

## State Derivation

### Last-event-wins is the correct strategy here

The two competing approaches are:

1. **Last-event-wins:** The current workflow state is entirely determined by the most recent
   decision event. Earlier events are history only.
2. **Folding (reduce):** Walk the entire event log and accumulate state, like a Redux reducer.

For this workflow, last-event-wins is correct because the state machine is linear with no
branching that requires remembering intermediate states. The event types are: `accepted`,
`rejected`, `escalated`. Each one completely determines the new workflow status.

### Derivation functions (centralized in `backend/app/domain/review_state.py`)

```python
def derive_workflow_status(
    investigation_status: InvestigationStatus,
    review_events: list[ReviewEvent],
) -> WorkflowStatus:
    # If pipeline put it in manual_review_required, respect that until a reviewer acts
    if not review_events:
        if investigation_status == InvestigationStatus.MANUAL_REVIEW_REQUIRED:
            return WorkflowStatus.MANUAL_REVIEW_REQUIRED
        return WorkflowStatus.PENDING_REVIEW

    last = review_events[-1]
    if last.event_type == EventType.ESCALATED:
        return WorkflowStatus.PENDING_SENIOR_REVIEW
    if last.event_type in (EventType.ACCEPTED, EventType.REJECTED):
        return WorkflowStatus.CLOSED
    return WorkflowStatus.PENDING_REVIEW  # fallback

def derive_final_disposition(
    review_events: list[ReviewEvent],
) -> FinalDisposition | None:
    for event in reversed(review_events):
        if event.event_type == EventType.ACCEPTED:
            return FinalDisposition.ACCEPTED
        if event.event_type == EventType.REJECTED:
            return FinalDisposition.REJECTED
    return None

def derive_required_role(workflow_status: WorkflowStatus) -> RequiredRole:
    if workflow_status == WorkflowStatus.PENDING_SENIOR_REVIEW:
        return RequiredRole.SENIOR_REVIEWER
    if workflow_status == WorkflowStatus.CLOSED:
        return RequiredRole.NONE
    return RequiredRole.REVIEWER  # PENDING_REVIEW and MANUAL_REVIEW_REQUIRED
```

### Why this is correct

- `requires_role_for_next_decision` is a single derived field. The UI reads it to gate buttons;
  the backend reads it to enforce authorization. Both derive from the same source of truth.
- Escalation-derived metadata (decisions 33-34 in the decision log) is best computed as
  properties that walk `review_events` once rather than duplicating the data as stored fields:

```python
@computed_field
@property
def escalated_by(self) -> ReviewEvent | None:
    return next((e for e in self.review_events if e.event_type == EventType.ESCALATED), None)

@computed_field
@property
def resolved_by(self) -> ReviewEvent | None:
    return next((e for e in reversed(self.review_events)
                 if e.event_type in (EventType.ACCEPTED, EventType.REJECTED)), None)
```

### Immutability guard at the route layer

The route that appends a new decision event must enforce:

```python
if inv.workflow_status == WorkflowStatus.CLOSED:
    raise HTTPException(status_code=409, detail="Final disposition is immutable")
```

This matches decision 37: final disposition is immutable once set. The guard lives in the
route, not in the model, because the model is a data container — business rules belong in the
service/route layer.

### Confidence: HIGH

Last-event-wins is the standard pattern for simple linear state machines. Confirmed by
reviewing the decision log (decisions 23, 37) and the existing `_validate_status_transition`
pattern in `loader.py`.

---

## Role Guard Pattern

### Recommended: layered dependency injection

FastAPI's `Depends()` system supports chaining. The right structure is three levels:

**Level 1 — Proxy secret + actor parsing (`backend/app/api/auth.py`):**

```python
from typing import Annotated
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

class CurrentActor(BaseModel):
    user_id: str
    email: str
    role: str
    display_name: str

def require_actor(
    x_internal_proxy_secret: Annotated[str, Header()],
    x_actor_user_id: Annotated[str, Header()],
    x_actor_email: Annotated[str, Header()],
    x_actor_role: Annotated[str, Header()],
    x_actor_display_name: Annotated[str, Header()],
) -> CurrentActor:
    if not secrets.compare_digest(
        x_internal_proxy_secret.encode(),
        settings.INTERNAL_PROXY_SECRET.encode(),
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid proxy secret")
    return CurrentActor(
        user_id=x_actor_user_id,
        email=x_actor_email,
        role=x_actor_role,
        display_name=x_actor_display_name,
    )

ActorDep = Annotated[CurrentActor, Depends(require_actor)]
```

**Level 2 — Role-specific guards:**

```python
def require_senior_or_admin(actor: ActorDep) -> CurrentActor:
    if actor.role not in ("senior_reviewer", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Senior reviewer or admin required")
    return actor

SeniorActorDep = Annotated[CurrentActor, Depends(require_senior_or_admin)]
```

**Level 3 — Route-level workflow-state guard:**

Role guards enforce who can act. Workflow-state guards enforce when they can act. These are
distinct and must be applied separately.

```python
@router.patch("/{claim_id}/investigation")
async def submit_decision(
    claim_id: str,
    body: DecisionRequest,
    actor: ActorDep,                    # always required: parses actor + validates secret
    store: Annotated[DataStore, Depends(get_data_store)],
) -> dict:
    inv = _get_investigation_or_404(store, claim_id)
    ws = inv.workflow_status

    # Workflow-state guard
    if ws == WorkflowStatus.CLOSED:
        raise HTTPException(409, "Final disposition is immutable")

    # Role guard for escalated cases
    if ws == WorkflowStatus.PENDING_SENIOR_REVIEW:
        if actor.role not in ("senior_reviewer", "admin"):
            raise HTTPException(403, "Only senior reviewer or admin can resolve escalated cases")

    # Notes required
    if not body.notes or not body.notes.strip():
        raise HTTPException(422, "Notes are required for every decision event")

    # ... append event, persist
```

### Why dependency injection over inline route logic

- `require_actor` runs on every mutating request; it belongs in a dependency so it cannot be
  forgotten on a new route.
- Role-specific guards (`require_senior_or_admin`) can be reused across multiple routes without
  copy-paste.
- Workflow-state guards are case-specific and correctly live in route logic since they need
  access to the loaded investigation object.
- The existing `dependencies.py` already uses this pattern for `get_data_store` — extend it,
  don't replace it.

### Using `secrets.compare_digest` for the proxy secret

Always use `secrets.compare_digest` to compare the proxy secret. Direct string equality
(`==`) is vulnerable to timing attacks that could allow an attacker to guess the secret
one character at a time. This is low-severity in an internal network but correct practice.

### Confidence: HIGH

Pattern verified against FastAPI official docs for header-based dependencies and HTTPException
in dependency functions.

---

## UI Table Stakes

### What users expect from a role-based review workflow UI

These are the features that make the review history UI feel trustworthy and complete. Missing
any of these will make the tool feel unfinished for an adjudication workflow.

**ReviewHistory component (UI-01):**
- Chronological event list, oldest first. Users read history top-to-bottom.
- Each event row shows: event type badge (color-coded: green=accepted, red=rejected,
  amber=escalated), actor display name, actor role at time of event, timestamp
  (human-readable "Apr 15, 2026, 2:14 PM"), and the full notes text.
- Visual distinction between decision events and comments. They live in the same timeline
  conceptually but must be visually differentiated (icon, border treatment, or row style).
- Empty state: "No review activity yet" when `review_events` is empty.
- Immutability signal: no edit/delete controls anywhere in the history. The append-only
  nature is a feature; make it obvious.

**CommentThread component (UI-02):**
- Append-only composer always visible (for roles with access), even on closed cases.
  This is per decision 36: post-resolution comments are allowed.
- Clear "case closed" visual indicator when `workflow_status === 'closed'`, but composer
  remains enabled so users know they can still comment.
- Comment attribution: display name + role + timestamp on every comment.
- No edit/delete controls on submitted comments.
- Character count or soft limit indication to discourage wall-of-text submissions.

**HumanReviewDesk refactor (UI-03):**
- Button visibility driven entirely by `requires_role_for_next_decision` from the API
  response, not computed client-side. The backend is the authority (decision 7).
- Three states the desk must handle cleanly:
  1. Current user's role matches `requires_role_for_next_decision` → show action buttons.
  2. Current user's role does not match → show read-only status with "awaiting [role]" copy.
  3. `workflow_status === 'closed'` → show resolver metadata (name, role, disposition,
     timestamp, notes) in a read-only "chain of custody" block.
- Notes field is required for every decision event (decision 43). The submit button must be
  disabled while notes are empty, and an inline validation message appears before the user
  can submit.
- Escalation copy must clearly communicate handoff: "This case has been escalated for senior
  review" is better than just showing a badge.
- When a reviewer opens an escalated case they own, buttons should be disabled with a clear
  reason ("Awaiting senior reviewer resolution"), not silently hidden.

**Claims queue integration:**
- `workflow_status` and `final_disposition` exposed as filterable columns in the claims list.
  Users need to find their open queue, the escalated queue, and closed cases separately.
- Role-appropriate queue defaults: reviewers default to `pending_review` filter;
  senior reviewers default to `pending_senior_review` filter.
- Pending senior review cases should have a visual "escalated" indicator in the row, not just
  in the detail view.

**Anti-features to avoid:**
- Do not show edit/delete buttons that are always disabled — remove them entirely for
  append-only data. Disabled controls imply the action is possible but blocked; absent
  controls imply the action does not exist.
- Do not derive `requires_role_for_next_decision` on the client from role + workflow_status.
  Always trust the value from the API.
- Do not conflate `workflow_status` and `final_disposition` in status badge copy. "Closed /
  Accepted" is clearer than "Accepted" alone.

### Confidence: MEDIUM

Based on standard internal-tool patterns for audit workflows and the specific decisions in the
decision log. No external verification possible for UI expectations in this domain.

---

## Recommendations

### 1. Use `@computed_field` for all derived state — not stored fields
**Confidence: HIGH**

`@computed_field` in Pydantic v2 means derived values appear in `model_dump()` output
automatically, are recomputed from the event log on every access, and cannot drift out of sync
with the source of truth. Never store `workflow_status`, `final_disposition`, or
`requires_role_for_next_decision` as mutable fields on the model.

### 2. Centralize ALL derivation logic in `backend/app/domain/review_state.py`
**Confidence: HIGH**

The plan specifies this file. Make it the single location for: role checks, event creation
helpers, comment creation helpers, and the three derivation functions. Routes import from
this module; they never reimplement the logic inline. This makes the logic unit-testable
in isolation from FastAPI routing.

### 3. Switch investigations persistence from Parquet to JSON
**Confidence: HIGH**

Parquet and nested list fields do not mix cleanly in pandas. JSON is the correct format for
document-style data with nested arrays. The atomic `os.replace(temp, final)` pattern from
the existing code is reused unchanged — only the format changes.

### 4. Implement role guards as chained FastAPI dependencies, not inline checks
**Confidence: HIGH**

`require_actor` (validates proxy secret, parses headers) belongs in `dependencies.py` and
runs on every mutating route. Role-specific guards (`require_senior_or_admin`) are thin
wrappers around it. Workflow-state guards live in route logic because they need the loaded
investigation.

### 5. Freeze event and comment models with `model_config = {"frozen": True}`
**Confidence: HIGH**

Immutability should be enforced at the model level, not just by convention. `frozen=True`
makes Pydantic raise a `ValidationError` if any code tries to mutate an event or comment
field after construction. This is cheap insurance against accidental mutation bugs.

### 6. Use `secrets.compare_digest` for proxy secret comparison
**Confidence: HIGH**

Required to avoid timing attacks on the shared secret. One line change from `==` to
`secrets.compare_digest(a.encode(), b.encode())`.

### 7. Derive escalator/resolver metadata as `@computed_field` properties
**Confidence: HIGH**

Decisions 33-34 require surfacing escalator/resolver context. Compute these by scanning
`review_events` at read time rather than duplicating the data as stored fields. A linear scan
of a small list (typically 1-5 events) has no performance cost worth measuring.

### 8. Enforce notes requirement at the route layer, not the model layer
**Confidence: HIGH**

`ReviewEvent.notes: str` (not `str | None`) is sufficient at the model level. The non-empty
check (`if not body.notes.strip()`) belongs in the route before constructing the event, so
the error is a 422 with a human-readable message, not a Pydantic validation error that
produces a generic "field required" response.

### 9. Keep `InvestigationStatus` (pipeline status) separate from `WorkflowStatus` (review status)
**Confidence: HIGH**

`InvestigationStatus` tracks where the AI pipeline is (PENDING, TRIAGE_COMPLETE, COMPLETE,
ERROR, MANUAL_REVIEW_REQUIRED). `WorkflowStatus` tracks where human review is
(pending_review, pending_senior_review, closed). These are orthogonal — a case can be
`MANUAL_REVIEW_REQUIRED` from the pipeline and `PENDING_REVIEW` from the human-review
perspective simultaneously. The derivation function for `workflow_status` takes both as inputs.

---

## Open Areas

- The exact `ReviewEvent.event_type` enum should not include values like `"comment"` —
  comments are in a separate list and must never appear in the decision event log.
- Whether `MANUAL_REVIEW_REQUIRED` cases default to `pending_review` or a dedicated
  workflow status step needs a UX decision: the decision log (decision 44) says reviewers
  can act on them, so they are effectively `pending_review` from a routing perspective.
- The plan mentions a compatibility mapping for legacy `claim_status` terminal values
  (`accepted`, `rejected`, `escalated`) loaded from parquet. Migration logic should map
  these to synthetic `ReviewEvent` entries with `actor_user_id="legacy"` and a note
  capturing the original value, rather than leaving `review_events=[]` with a mismatch
  between the old `claim_status` and the derived `workflow_status`.

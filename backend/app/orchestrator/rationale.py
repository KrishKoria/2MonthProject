"""LLM rationale node (T044) — single streaming OpenAI call, Pydantic-validated.

Constitution I/III/VI/VII:
- Only LLM call in the pipeline.
- All evidence is pre-assembled in the prompt; no tool calls from the model.
- SHAP invariant pre-check before the LLM call (abs(sum − (pred − base)) < 1e-5).
- Final output validated against `RationaleResult` and required anomaly-flag keys.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import AsyncIterator

from pydantic import ValidationError

from app.config import settings
from app.data.schemas import RationaleResult

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "rationale.md"
_REQUIRED_FLAG_KEYS = {"upcoding", "ncci_violation", "duplicate"}


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def _check_shap_invariant(
    shap_values: dict[str, float], pred: float, base: float
) -> None:
    total = sum(float(v) for v in shap_values.values() if isinstance(v, (int, float)))
    diff = abs(total - (pred - base))
    if diff > 1e-5:
        raise ValueError(
            f"SHAP invariant violated: |sum(shap) - (pred - base)| = {diff:.2e}"
        )


def _render_prompt(claim: dict, triage: dict, evidence: dict) -> str:
    template = _load_prompt()
    return (
        template
        .replace("{claim_json}", json.dumps(claim, default=str, indent=2))
        .replace("{triage_json}", json.dumps(triage, default=str, indent=2))
        .replace("{evidence_json}", json.dumps(evidence, default=str, indent=2))
    )


def _triage_view(state: dict) -> dict:
    return {
        "anomaly_type": state.get("anomaly_type"),
        "anomaly_flags": state.get("anomaly_flags") or {},
        "confidence": state.get("confidence"),
        "priority": state.get("priority"),
    }


async def stream_rationale(
    state: dict,
    *,
    client: object | None = None,
    model: str | None = None,
) -> AsyncIterator[dict]:
    """Stream the rationale LLM call.

    Yields:
        {"type": "chunk",    "text": str}               — per streamed delta
        {"type": "complete", "result": RationaleResult} — on successful parse
        {"type": "error",    "message": str}            — terminal failure
    """
    claim = state.get("claim_data") or {}
    triage = _triage_view(state)
    evidence = state.get("evidence_results") or {}

    # SHAP invariant pre-check (constitution VI, R-007). The per-claim SHAP dict
    # from the scoring pipeline uses feature-name keys; a `base_value` entry is
    # optional. Skip the check cleanly if we lack base/pred metadata.
    shap_values = dict(state.get("shap_values") or {})
    base = shap_values.pop("base_value", None)
    pred = state.get("xgboost_risk_score")
    if shap_values and base is not None and pred is not None:
        try:
            _check_shap_invariant(shap_values, float(pred), float(base))
        except ValueError as exc:
            yield {"type": "error", "message": str(exc)}
            return

    # Import openai lazily so the module imports cleanly in environments without
    # the key set (e.g. the orchestrator unit tests where the client is mocked).
    if client is None:
        from openai import AsyncOpenAI

        if not settings.OPENAI_API_KEY:
            yield {"type": "error", "message": "openai_api_key_not_configured"}
            return
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    mdl = model or settings.LLM_MODEL
    prompt = _render_prompt(claim, triage, evidence)
    messages = [{"role": "user", "content": prompt}]

    buffer = ""
    try:
        stream = await client.chat.completions.create(  # type: ignore[attr-defined]
            model=mdl,
            messages=messages,
            temperature=0.2,
            response_format={"type": "json_object"},
            stream=True,
        )
        async for event in stream:
            choices = getattr(event, "choices", None) or []
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            text = getattr(delta, "content", None) if delta is not None else None
            if text:
                buffer += text
                yield {"type": "chunk", "text": text}
    except Exception as exc:
        logger.exception("LLM streaming failed")
        yield {"type": "error", "message": f"llm_error: {exc}"}
        return

    # Parse the accumulated JSON and validate.
    try:
        parsed = json.loads(buffer)
    except json.JSONDecodeError as exc:
        yield {"type": "error", "message": f"rationale_json_parse_failed: {exc}"}
        return

    # Ensure all 3 anomaly-flag keys are addressed before Pydantic validation so we
    # can surface a specific error if the model omits one (constitution VII).
    flags = parsed.get("anomaly_flags_addressed") if isinstance(parsed, dict) else None
    if not isinstance(flags, dict) or not _REQUIRED_FLAG_KEYS.issubset(flags.keys()):
        missing = _REQUIRED_FLAG_KEYS - set(flags.keys() if isinstance(flags, dict) else [])
        yield {"type": "error", "message": f"missing_anomaly_flags_addressed: {sorted(missing)}"}
        return

    try:
        result = RationaleResult.model_validate(parsed)
    except ValidationError as exc:
        yield {"type": "error", "message": f"rationale_validation_failed: {exc.errors()}"}
        return

    yield {"type": "complete", "result": result}


async def run_rationale(state: dict, **kwargs) -> dict:
    """Non-streaming runner used by the LangGraph graph."""
    result: RationaleResult | None = None
    error: str | None = None
    async for ev in stream_rationale(state, **kwargs):
        if ev["type"] == "complete":
            result = ev["result"]
        elif ev["type"] == "error":
            error = ev["message"]
    if error:
        return {"error_message": error, "investigation_status": "error"}
    if result is None:
        return {"error_message": "rationale_no_output", "investigation_status": "error"}
    return {
        "rationale": result.model_dump(mode="json"),
        "investigation_status": "complete",
    }

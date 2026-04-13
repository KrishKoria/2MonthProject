"""LangGraph investigation pipeline (T039 + T045).

The SSE endpoint drives nodes directly so it can emit per-chunk `rationale_chunk`
events. This compiled graph provides the canonical definition used by the
orchestrator integration tests (T069) and for non-streaming invocation paths.
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.data.loader import DataStore
from app.data.schemas import InvestigationState
from app.orchestrator.evidence import run_evidence
from app.orchestrator.rationale import run_rationale
from app.orchestrator.triage import run_triage


def _route_after_evidence(state: dict) -> str:
    status = state.get("investigation_status")
    if status == "manual_review_required":
        return "halt"
    if status == "error":
        return "error"
    return "rationale"


def build_graph(store: DataStore):
    """Compile the investigation StateGraph bound to a concrete DataStore."""
    graph = StateGraph(InvestigationState)

    def _triage_node(state: dict) -> dict:
        return run_triage(state)

    def _evidence_node(state: dict) -> dict:
        return run_evidence(state, store)

    async def _rationale_node(state: dict) -> dict:
        return await run_rationale(state)

    graph.add_node("triage", _triage_node)
    graph.add_node("evidence", _evidence_node)
    graph.add_node("rationale", _rationale_node)

    graph.set_entry_point("triage")
    graph.add_edge("triage", "evidence")
    graph.add_conditional_edges(
        "evidence",
        _route_after_evidence,
        {"rationale": "rationale", "halt": END, "error": END},
    )
    graph.add_edge("rationale", END)
    return graph.compile()

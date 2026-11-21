"""Connect the underwriting steps into a LangGraph workflow."""

from typing import Any

from langgraph.graph import END, START, StateGraph

from zerocibil.agents.authenticity import investigate
from zerocibil.agents.document_intake import document_intake
from zerocibil.agents.explainability import explain as build_decision_trace
from zerocibil.agents.failure import fail_closed
from zerocibil.agents.financial_analyst import analyze
from zerocibil.agents.orchestrator import route_after_validate, validate
from zerocibil.agents.policy_terms import apply_policy
from zerocibil.agents.stress import analyze_stress
from zerocibil.config import DEFAULT_POLICY
from zerocibil.observability import configure_tracing, traceable
from zerocibil.tools.audit import append_decision_step
from zerocibil.state import UnderwritingState


@traceable(name="node.normalize", run_type="chain")
def normalize_node(state: dict[str, Any]) -> dict[str, Any]:
    try:
        return analyze(state, DEFAULT_POLICY)
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        return {
            "status": "DATA_QUALITY_FAILED",
            "errors": [
                {"code": "NORMALIZATION_FAILED", "message": str(exc)}
            ],
            "decision_trace": append_decision_step(
                state,
                stage="normalize",
                status="failed",
                checks=[{"check": "normalization", "status": "failed"}],
                reason_codes=["NORMALIZATION_FAILED"],
            ),
        }


@traceable(name="node.authenticity", run_type="chain")
def authenticity_node(state: dict[str, Any]) -> dict[str, Any]:
    return investigate(state, DEFAULT_POLICY)


@traceable(name="node.stress", run_type="chain")
def stress_node(state: dict[str, Any]) -> dict[str, Any]:
    return analyze_stress(state, DEFAULT_POLICY)


@traceable(name="route.after_authenticity", run_type="chain")
def route_after_authenticity(state: dict) -> str:
    if state.get("status") == "FAILED_CLOSED":
        return "fail_closed"
    return "stress" if state.get("auth_gate") == "PASS" else "policy_terms"


@traceable(name="route.after_normalize", run_type="chain")
def route_after_normalize(state: dict) -> str:
    if state.get("status") == "DATA_QUALITY_FAILED":
        return "fail_closed"
    return "authenticity"


@traceable(name="route.after_stress", run_type="chain")
def route_after_stress(state: dict) -> str:
    if state.get("status") == "FAILED_CLOSED":
        return "fail_closed"
    return "policy_terms"


def build_graph(checkpointer: Any = None):
    graph = StateGraph(UnderwritingState)
    graph.add_node("validate", validate)
    graph.add_node("document_intake", document_intake)
    graph.add_node("normalize", normalize_node)
    graph.add_node("authenticity", authenticity_node)
    graph.add_node("stress", stress_node)
    graph.add_node("policy_terms", apply_policy)
    graph.add_node("decision_trace_builder", build_decision_trace)
    graph.add_node("fail_closed", fail_closed)

    graph.add_edge(START, "validate")
    graph.add_conditional_edges(
        "validate",
        route_after_validate,
        {
            "fail_closed": "fail_closed",
            "explain": "policy_terms",
            "document_intake": "document_intake",
            "normalize": "normalize",
        },
    )
    graph.add_edge("document_intake", "normalize")
    graph.add_conditional_edges(
        "normalize",
        route_after_normalize,
        {"fail_closed": "fail_closed", "authenticity": "authenticity"},
    )
    graph.add_conditional_edges(
        "authenticity",
        route_after_authenticity,
        {
            "stress": "stress",
            "policy_terms": "policy_terms",
            "fail_closed": "fail_closed",
        },
    )
    graph.add_conditional_edges(
        "stress",
        route_after_stress,
        {"fail_closed": "fail_closed", "policy_terms": "policy_terms"},
    )
    graph.add_edge("policy_terms", "decision_trace_builder")
    graph.add_edge("decision_trace_builder", END)
    graph.add_edge("fail_closed", "decision_trace_builder")
    return graph.compile(checkpointer=checkpointer)


def invoke_graph(graph: Any, state: dict[str, Any], *, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    """Invoke the graph with stable LangSmith project and eval metadata."""
    return graph.invoke(state, config=configure_tracing("underwriting-agent", metadata))

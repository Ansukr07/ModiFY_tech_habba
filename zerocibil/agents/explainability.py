"""Build the final decision trace from recorded workflow evidence."""

from zerocibil.observability import traceable
from zerocibil.tools.audit import append_event
from zerocibil.tools.explanations import reconstruct


@traceable(name="node.decision_trace", run_type="chain")
def explain(state: dict) -> dict:
    result = {"explanation": reconstruct(state)}
    result["audit_events"] = append_event(
        {**state, **result}, "decision_trace", "decision_trace_reconstructed"
    )
    return result

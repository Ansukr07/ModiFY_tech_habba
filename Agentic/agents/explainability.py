"""Create a plain-language explanation from recorded workflow facts."""

from zerocibil.tools.audit import append_event
from zerocibil.tools.explanations import generate


def explain(state: dict) -> dict:
    language = state.get("owner_language", "en")
    result = {"explanation": generate(state, language)}
    result["audit_events"] = append_event(
        {**state, **result},
        "explain",
        "explanation_created",
        {"fallback": True},
    )
    return result

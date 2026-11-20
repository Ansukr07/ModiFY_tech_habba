"""Stop safely when the workflow cannot complete."""

from zerocibil.tools.audit import append_event


def fail_closed(state: dict) -> dict:
    errors = list(state.get("errors", []))
    if state.get("status") == "DATA_QUALITY_FAILED":
        errors.append(
            {
                "code": "DATA_QUALITY_FAILED",
                "message": "Financial records need correction or review",
            }
        )

    result = {
        "status": "FAILED_CLOSED",
        "verdict": "REVIEW",
        "errors": errors,
        "human_review": {
            "required": True,
            "reason": "Workflow could not safely complete",
        },
    }
    result["audit_events"] = append_event(
        {**state, **result}, "fail_closed", "workflow_failed_closed"
    )
    return result

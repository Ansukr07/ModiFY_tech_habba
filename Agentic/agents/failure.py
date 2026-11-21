"""Stop safely when the workflow cannot complete."""

from zerocibil.tools.audit import append_decision_step, append_event
from zerocibil.observability import traceable


@traceable(name="node.fail_closed", run_type="chain")
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
    result["decision_trace"] = append_decision_step(
        state,
        stage="fail_closed",
        status="failed",
        checks=[{"check": "workflow_completion", "status": "failed"}],
        reason_codes=[error.get("code", "WORKFLOW_FAILED") for error in errors],
        details={"human_review": result["human_review"]},
    )
    result["audit_events"] = append_event(
        {**state, **result}, "fail_closed", "workflow_failed_closed"
    )
    return result

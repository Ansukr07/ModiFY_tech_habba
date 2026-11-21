"""Check each application and choose the next graph step."""

from typing import Any

from zerocibil.tools.audit import append_decision_step, append_event
from zerocibil.observability import traceable

SUPPORTED_SCHEMA = "1.0"


@traceable(name="node.validate", run_type="chain")
def validate(state: dict[str, Any]) -> dict[str, Any]:
    errors = list(state.get("errors", []))
    if state.get("schema_version") != SUPPORTED_SCHEMA:
        errors.append(
            {"code": "SCHEMA_MISMATCH", "message": "Unsupported schema version"}
        )
    if not state.get("application_id") or not isinstance(state.get("shop"), dict):
        errors.append(
            {
                "code": "INVALID_APPLICATION",
                "message": "application_id and shop are required",
            }
        )

    rails = state.get("rails", [])
    if not isinstance(rails, list) or any(not isinstance(rail, dict) for rail in rails):
        errors.append(
            {"code": "INVALID_RAILS", "message": "rails must be a list of objects"}
        )
        rails = []
    cashflows = state.get("cashflows", [])
    if not isinstance(cashflows, list) or any(
        not isinstance(row, dict) for row in cashflows
    ):
        errors.append(
            {
                "code": "INVALID_CASHFLOWS",
                "message": "cashflows must be a list of objects",
            }
        )
    verified_count = sum(
        1
        for rail in rails
        if (rail.get("trust_class") or rail.get("trustClass")) in {"verified", "verified_simulated"}
        and (rail.get("rail_type") or rail.get("type")) != "pdf"
    )
    provenance_counts: dict[str, int] = {}
    for rail in rails:
        source = rail.get("provenance", "unknown")
        provenance_counts[source] = provenance_counts.get(source, 0) + 1

    status = "VALIDATED" if not errors else "REJECTED"
    result = {
        "errors": errors,
        "verified_rail_count": verified_count,
        "provenance_summary": provenance_counts,
        "status": status,
    }
    result["decision_trace"] = append_decision_step(
        state,
        stage="validate",
        status="passed" if not errors else "failed",
        checks=[
            {"check": "schema_version", "status": "passed" if state.get("schema_version") == SUPPORTED_SCHEMA else "failed"},
            {"check": "application_shape", "status": "passed" if state.get("application_id") and isinstance(state.get("shop"), dict) else "failed"},
            {"check": "rails_shape", "status": "passed" if isinstance(state.get("rails", []), list) and all(isinstance(rail, dict) for rail in state.get("rails", [])) else "failed"},
            {"check": "cashflows_shape", "status": "passed" if isinstance(state.get("cashflows", []), list) and all(isinstance(row, dict) for row in state.get("cashflows", [])) else "failed"},
        ],
        reason_codes=[error.get("code", "VALIDATION_FAILED") for error in errors],
        details={"verified_rail_count": verified_count, "provenance_summary": provenance_counts},
    )
    result["audit_events"] = append_event(
        {**state, **result},
        "validate",
        "application_validated" if not errors else "application_rejected",
    )
    if verified_count == 0 and not errors:
        result["verdict"] = "UNVERIFIED"
    return result


@traceable(name="route.after_validate", run_type="chain")
def route_after_validate(state: dict) -> str:
    if state.get("errors"):
        return "fail_closed"
    if state.get("verified_rail_count", 0) == 0:
        return "explain"
    if state.get("documents"):
        return "document_intake"
    return "normalize"

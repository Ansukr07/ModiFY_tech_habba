"""Turn the calculated capacity into a versioned offer or review outcome."""

from zerocibil.tools.audit import append_decision_step, append_event
from zerocibil.observability import traceable


@traceable(name="node.policy_terms", run_type="chain")
def apply_policy(state: dict) -> dict:
    capacity = state.get("capacity", {})
    gate = state.get("auth_gate")

    if gate != "PASS":
        verdict = "THIN_FILE" if gate == "MORE_EVIDENCE" else "REVIEW"
    elif capacity.get("max_principal_paise", 0) <= 0:
        verdict = "THIN_FILE"
    else:
        verdict = "OFFER"

    terms = {
        "max_principal_paise": capacity.get("max_principal_paise", 0),
        "weekly_emi_paise": capacity.get("max_emi_weekly_paise", 0),
        "tenure_months": capacity.get("tenure_months"),
        "cadence": capacity.get("cadence"),
        "rate_annual": capacity.get("rate_annual"),
        "policy_version": state.get("policy_version", "prototype-0.1"),
    }
    result = {"verdict": verdict, "terms": terms}
    result["audit_events"] = append_event(
        {**state, **result},
        "policy_terms",
        "terms_calculated",
        {"verdict": verdict},
    )
    result["decision_trace"] = append_decision_step(
        state,
        stage="policy_terms",
        status="passed" if verdict == "OFFER" else "review",
        checks=[{
            "check": "policy_offer_gate",
            "status": "passed" if verdict == "OFFER" else "review",
            "auth_gate": gate,
            "capacity_paise": capacity.get("max_principal_paise", 0),
            "thresholds": {"minimum_capacity_paise": 1, "required_auth_gate": "PASS"},
        }],
        reason_codes=[] if verdict == "OFFER" else ["AUTH_GATE_NOT_PASSED" if gate != "PASS" else "CAPACITY_NOT_POSITIVE"],
        details={"verdict": verdict, "policy_version": terms["policy_version"], "terms": terms},
    )
    return result

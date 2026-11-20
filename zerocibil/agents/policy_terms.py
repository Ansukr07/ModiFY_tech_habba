"""Turn the calculated capacity into a versioned offer or review outcome."""

from zerocibil.tools.audit import append_event


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
    return result

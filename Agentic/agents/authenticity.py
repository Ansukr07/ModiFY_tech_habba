"""Review evidence quality using the authenticity score and clear rules."""

from typing import Any

from zerocibil.config import DEFAULT_POLICY, Policy
from zerocibil.tools.audit import append_event
from zerocibil.tools.scoring import ScoringError, score


def investigate(
    state: dict[str, Any], policy: Policy = DEFAULT_POLICY
) -> dict[str, Any]:
    missing = state.get("missing_features", [])
    if missing:
        return {
            "auth_gate": "MORE_EVIDENCE",
            "verification_requests": missing,
            "authenticity_band": "UNKNOWN",
        }

    try:
        probability, version = score("authenticity", state.get("features", {}))
    except ScoringError as exc:
        return {
            "status": "FAILED_CLOSED",
            "auth_gate": "REVIEW",
            "errors": [
                {"code": "AUTHENTICITY_SCORING_FAILED", "message": str(exc)}
            ],
            "human_review": {"required": True, "reason": "Scoring failed"},
        }
    if probability < policy.authenticity_low_max:
        band = "LOW"
    elif probability >= policy.authenticity_high_min:
        band = "HIGH"
    else:
        band = "MEDIUM"

    flags = list(state.get("supporting_signals", []))
    duplicate_count = state.get("data_quality", {}).get("duplicate_count", 0)
    if duplicate_count:
        flags.append({"code": "DUPLICATE_RECORDS", "count": duplicate_count})

    has_pdf = any(rail.get("rail_type") == "pdf" for rail in state.get("rails", []))
    verified_count = state.get("verified_rail_count", 0)
    if has_pdf and not verified_count:
        gate = "MORE_EVIDENCE"
    elif flags or band != "HIGH":
        gate = "REVIEW"
    else:
        gate = "PASS"

    requests = []
    if gate == "MORE_EVIDENCE":
        requests = ["verified bank statement or UPI rail"]

    result = {
        "p_auth": probability,
        "authenticity_band": band,
        "authenticity_flags": flags,
        "auth_gate": gate,
        "verification_requests": requests,
        "model_versions": {
            **state.get("model_versions", {}),
            "authenticity": version,
        },
    }
    result["audit_events"] = append_event(
        {**state, **result},
        "authenticity",
        "authenticity_scored",
        {"band": band, "gate": gate},
    )
    return result

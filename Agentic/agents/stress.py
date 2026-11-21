"""Estimate cash-flow stress and calculate a cautious capacity."""

from typing import Any

from zerocibil.config import DEFAULT_POLICY, Policy
from zerocibil.tools.audit import append_decision_step, append_event
from zerocibil.tools.finance import capacity
from zerocibil.tools.scoring import ScoringError, score
from zerocibil.observability import traceable


@traceable(name="node.stress", run_type="chain")
def analyze_stress(
    state: dict[str, Any], policy: Policy = DEFAULT_POLICY
) -> dict[str, Any]:
    try:
        probability, version = score(
            "stress", state.get("features", {}), state.get("feature_variant")
        )
    except ScoringError as exc:
        return {
            "status": "FAILED_CLOSED",
            "errors": [{"code": "STRESS_SCORING_FAILED", "message": str(exc)}],
            "human_review": {"required": True, "reason": "Scoring failed"},
        }
    if probability <= policy.stress_low_max:
        band = "LOW"
    elif probability <= policy.stress_medium_max:
        band = "MEDIUM"
    else:
        band = "HIGH"

    has_bank_rail = any(
        (rail.get("rail_type") or rail.get("type")) == "aa"
        and (rail.get("trust_class") or rail.get("trustClass")) in {"verified", "verified_simulated"}
        for rail in state.get("rails", [])
    )
    calculated_capacity = capacity(
        state.get("weekly_series", []),
        state.get("features", {}),
        probability,
        has_bank_rail,
        policy,
    )
    result = {
        "p_stress": probability,
        "stress_band": band,
        "stress_drivers": [],
        "capacity": calculated_capacity,
        "model_versions": {
            **state.get("model_versions", {}),
            "stress": version,
        },
    }
    result["audit_events"] = append_event(
        {**state, **result}, "stress", "stress_scored", {"band": band}
    )
    result["decision_trace"] = append_decision_step(
        state,
        stage="stress",
        status="passed",
        checks=[{
            "check": "stress_score_band",
            "status": "passed",
            "score": probability,
            "thresholds": {"low_max": policy.stress_low_max, "medium_max": policy.stress_medium_max},
        }],
        details={"stress_band": band, "model_variant": state.get("feature_variant"), "capacity": calculated_capacity},
    )
    return result

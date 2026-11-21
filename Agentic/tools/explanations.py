"""Reconstruct a deterministic explanation from execution provenance."""

from typing import Any

from zerocibil.observability import traceable


@traceable(name="tool.reconstruct_decision_trace", run_type="tool")
def reconstruct(state: dict[str, Any]) -> dict[str, Any]:
    """Return structured evidence describing how this outcome was reached."""
    audit_events = state.get("audit_events", [])
    decision_trace = state.get("decision_trace", [])
    executed = []
    seen = set()
    for step in decision_trace:
        stage = step.get("stage")
        if stage and stage not in seen:
            seen.add(stage)
            executed.append(stage)
    for event in audit_events:
        stage = event.get("node")
        if stage and stage not in seen:
            seen.add(stage)
            executed.append(stage)

    reason_codes = []
    for step in decision_trace:
        reason_codes.extend(step.get("reason_codes", []))
    for error in state.get("errors", []):
        code = error.get("code")
        if code and code not in reason_codes:
            reason_codes.append(code)

    model_versions = dict(state.get("model_versions", {}))
    checks = [check for step in decision_trace for check in step.get("checks", [])]
    return {
        "kind": "decision_trace",
        "version": "1.0",
        "outcome": state.get("verdict", "REVIEW"),
        "status": state.get("status"),
        "stages_executed": executed,
        "checks": checks,
        "reason_codes": list(dict.fromkeys(reason_codes)),
        "models": {
            "versions": model_versions,
            "predictions": {
                "authenticity": state.get("p_auth"),
                "stress": state.get("p_stress"),
            },
            "bands": {
                "authenticity": state.get("authenticity_band"),
                "stress": state.get("stress_band"),
            },
            "feature_variant": state.get("feature_variant"),
        },
        "policy": {
            "version": state.get("policy_version", "prototype-0.1"),
            "thresholds": _policy_thresholds(decision_trace),
            "terms": state.get("terms"),
        },
        "verification_requests": state.get("verification_requests", []),
        "audit_events": audit_events,
        "execution": decision_trace,
    }


def _policy_thresholds(steps: list[dict[str, Any]]) -> dict[str, Any]:
    thresholds = {}
    for step in steps:
        for check in step.get("checks", []):
            values = check.get("thresholds")
            if values:
                thresholds[f"{step.get('stage')}.{check.get('check')}"] = values
    return thresholds

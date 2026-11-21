"""Create append-only audit records for the current workflow run."""

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any
from zerocibil.observability import traceable


@traceable(name="tool.append_audit_event", run_type="tool")
def append_event(
    state: dict[str, Any],
    node: str,
    event: str,
    details: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return the previous audit records plus a new event."""
    source = json.dumps(
        state.get("rails", []), sort_keys=True, default=str
    ).encode()
    input_hash = sha256(source).hexdigest()
    record = {
        "application_id": state.get("application_id"),
        "event": event,
        "node": node,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "versions": state.get("model_versions", {}),
        "policy_version": state.get("policy_version", "prototype-0.1"),
        "input_hash": input_hash,
        "details": details or {},
    }
    return [*state.get("audit_events", []), record]


def append_decision_step(
    state: dict[str, Any],
    *,
    stage: str,
    status: str,
    checks: list[dict[str, Any]] | None = None,
    reason_codes: list[str] | None = None,
    details: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Append structured provenance for deterministic decision reconstruction."""
    step = {
        "stage": stage,
        "status": status,
        "checks": checks or [],
        "reason_codes": reason_codes or [],
        "details": details or {},
        "policy_version": state.get("policy_version", "prototype-0.1"),
        "model_versions": dict(state.get("model_versions", {})),
    }
    return [*state.get("decision_trace", []), step]

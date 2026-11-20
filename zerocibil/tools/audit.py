"""Create append-only audit records for the current workflow run."""

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any


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

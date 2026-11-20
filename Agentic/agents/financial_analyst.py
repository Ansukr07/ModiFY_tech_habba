"""Prepare financial records and build the shared feature set."""

from typing import Any

from zerocibil.config import DEFAULT_POLICY, Policy
from zerocibil.tools.finance import (
    build_features,
    normalize_cashflows,
    quality_check,
    reconcile,
    weekly_series,
)


def analyze(
    state: dict[str, Any], policy: Policy = DEFAULT_POLICY
) -> dict[str, Any]:
    rows = normalize_cashflows(state.get("cashflows", []), state.get("rails", []))
    quality = quality_check(rows)
    if not quality["passed"]:
        return {
            "cashflows": rows,
            "data_quality": quality,
            "status": "DATA_QUALITY_FAILED",
        }

    weeks = weekly_series(rows)
    features, missing = build_features(rows, weeks, state.get("rails", []))
    reconciliation = reconcile(state.get("rails", []), rows, policy)
    signals = list(state.get("supporting_signals", []))

    if reconciliation.get("flag"):
        signals.append(
            {"code": "GST_DIGITAL_GAP", "gap": reconciliation["gap"]}
        )

    has_bank_rail = any(
        rail.get("rail_type") == "aa"
        and rail.get("trust_class") in {"verified", "verified_simulated"}
        for rail in state.get("rails", [])
    )
    variant = "full" if has_bank_rail else "inflow_only"

    return {
        "cashflows": rows,
        "data_quality": quality,
        "weekly_series": weeks,
        "features": features,
        "missing_features": missing,
        "feature_variant": variant,
        "reconciliation": reconciliation,
        "supporting_signals": signals,
    }

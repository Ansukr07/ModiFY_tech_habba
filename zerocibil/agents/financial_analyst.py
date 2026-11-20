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


def _statement_result(state: dict[str, Any], rows: list[dict[str, Any]], quality: dict[str, Any], weeks: list[dict[str, int]] | None = None) -> dict[str, Any] | None:
    if not state.get("statement_intake") and not state.get("statement_rows"):
        return None
    intake = dict(state.get("statement_intake") or {})
    intake.update({
        "normalized_rows": len(rows),
        "week_count": len(weeks or []),
        "quality_passed": quality["passed"],
        "source": "bank_statement_pdf",
    })
    return intake


def analyze(
    state: dict[str, Any], policy: Policy = DEFAULT_POLICY
) -> dict[str, Any]:
    rows = normalize_cashflows(state.get("cashflows", []), state.get("rails", []))
    quality = quality_check(rows)
    if not quality["passed"]:
        failed = {
            "cashflows": rows,
            "data_quality": quality,
            "status": "DATA_QUALITY_FAILED",
        }
        intake = _statement_result(state, rows, quality)
        if intake:
            failed["statement_intake"] = intake
        return failed

    weeks = weekly_series(rows)
    features, missing = build_features(rows, weeks, state.get("rails", []))
    reconciliation = reconcile(state.get("rails", []), rows, policy)
    signals = list(state.get("supporting_signals", []))

    if reconciliation.get("flag"):
        signals.append(
            {"code": "GST_DIGITAL_GAP", "gap": reconciliation["gap"]}
        )

    has_bank_rail = any(
        (rail.get("rail_type") or rail.get("type")) == "aa"
        and (rail.get("trust_class") or rail.get("trustClass")) in {"verified", "verified_simulated"}
        for rail in state.get("rails", [])
    )
    variant = "B-full" if has_bank_rail else "B-inflow"

    result = {
        "cashflows": rows,
        "data_quality": quality,
        "weekly_series": weeks,
        "features": features,
        "missing_features": missing,
        "feature_variant": variant,
        "reconciliation": reconciliation,
        "supporting_signals": signals,
    }
    intake = _statement_result(state, rows, quality, weeks)
    if intake:
        result["statement_intake"] = intake
    return result

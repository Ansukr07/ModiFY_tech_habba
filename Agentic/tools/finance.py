"""Canonicalization, features, reconciliation, and capacity calculations."""

from collections import defaultdict
from datetime import date, datetime
from math import log1p
from typing import Any

from zerocibil.config import Policy


def normalize_cashflows(
    raw: list[dict[str, Any]], rails: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    rail_map = {str(r.get("rail_id")): r for r in rails}
    out = []
    for item in raw:
        rail = rail_map.get(str(item.get("source_rail_id")), {})
        out.append(
            {
                "account_id": item.get("account_id"),
                "ts": str(item.get("ts", item.get("timestamp", ""))),
                "inflow": int(item.get("inflow_paise", item.get("inflow", 0))),
                "outflow": int(item.get("outflow_paise", item.get("outflow", 0))),
                "counterparty_id": item.get(
                    "counterparty_id", item.get("payer_id")
                ),
                "channel": item.get("channel", rail.get("rail_type", "unknown")),
                "source_rail": item.get("source_rail_id"),
                "provenance": item.get(
                    "provenance", rail.get("provenance", "unknown")
                ),
            }
        )
    return out


def quality_check(rows: list[dict[str, Any]]) -> dict[str, Any]:
    keys, duplicates, invalid = set(), 0, []
    for i, row in enumerate(rows):
        key = (
            row.get("source_rail"),
            row.get("ts"),
            row.get("inflow"),
            row.get("outflow"),
            row.get("counterparty_id"),
        )
        if key in keys:
            duplicates += 1
        keys.add(key)
        if row["inflow"] < 0 or row["outflow"] < 0 or not row["ts"]:
            invalid.append(i)
    return {
        "passed": not invalid,
        "duplicate_count": duplicates,
        "invalid_row_indexes": invalid,
    }


def weekly_series(rows: list[dict[str, Any]]) -> list[dict[str, int]]:
    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {"inflow": 0, "outflow": 0}
    )
    for row in rows:
        try:
            dt = datetime.fromisoformat(row["ts"].replace("Z", "+00:00")).date()
        except ValueError:
            dt = date.fromisoformat(row["ts"][:10])
        monday = date.fromordinal(dt.toordinal() - dt.weekday()).isoformat()
        buckets[monday]["inflow"] += row["inflow"]
        buckets[monday]["outflow"] += row["outflow"]
    return [{"week": key, **value} for key, value in sorted(buckets.items())][-26:]


def build_features(
    rows: list[dict[str, Any]],
    weeks: list[dict[str, int]],
    rails: list[dict[str, Any]],
) -> tuple[dict[str, float], list[str]]:
    inflows = [float(week["inflow"]) for week in weeks]
    if len(inflows) < 2:
        return {}, ["history_weeks", "lean_month_ratio", "cv_weekly_inflow"]
    mean = sum(inflows) / len(inflows)
    payers: dict[str, int] = defaultdict(int)
    total = 0
    for row in rows:
        if row["inflow"] > 0:
            payer = str(row.get("counterparty_id") or "unknown")
            payers[payer] += row["inflow"]
            total += row["inflow"]
    shares = [v / total for v in payers.values()] if total else []
    gst = sum(row["inflow"] for row in rows if row["channel"] == "gst")
    digital = sum(
        row["inflow"] for row in rows if row["channel"] in {"upi", "aa"}
    )
    gap = abs(gst - digital) / max(gst, digital, 1) if gst and digital else None
    low_weeks = sorted(inflows)[: min(4, len(inflows))]
    high_weeks = sorted(inflows, reverse=True)[: min(4, len(inflows))]
    transaction_count = sum(1 for row in rows if row["inflow"] > 0)
    round_count = sum(
        1
        for row in rows
        if row["inflow"] and row["inflow"] % 100000 == 0
    )
    verified_count = sum(
        1
        for rail in rails
        if rail.get("trust_class") in {"verified", "verified_simulated"}
        and rail.get("rail_type") != "pdf"
    )
    feats = {
        "p10_rel": min(inflows) / mean if mean else 0.0,
        "cv_weekly_inflow": (
            (sum((value - mean) ** 2 for value in inflows) / len(inflows)) ** 0.5
            / mean
            if mean
            else 0.0
        ),
        "slope_rel": (inflows[-1] - inflows[0]) / max(mean * len(inflows), 1),
        "lean_month_ratio": sum(low_weeks) / max(sum(high_weeks), 1),
        "active_week_ratio": sum(value > 0 for value in inflows) / len(inflows),
        "outflow_ratio": sum(row["outflow"] for row in rows) / max(total, 1),
        "log1p_unique_payers": log1p(len(payers)),
        "payer_hhi": sum(value * value for value in shares),
        "max_payer_share": max(shares, default=0.0),
        "round_amount_ratio": round_count / max(transaction_count, 1),
        "history_weeks": float(len(weeks)),
        "empty_then_spike": float(
            len(inflows) > 4
            and any(value == 0 for value in inflows[-5:-1])
            and inflows[-1] > max(mean * 2, 1)
        ),
        "rail_count_verified": float(verified_count),
    }
    if gap is not None:
        feats["gst_upi_rel_gap"] = gap
    missing = [name for name in ("gst_upi_rel_gap",) if name not in feats]
    return feats, missing


def reconcile(
    rails: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    policy: Policy,
) -> dict[str, Any]:
    gst = sum(row["inflow"] for row in rows if row["channel"] == "gst")
    digital = sum(
        row["inflow"] for row in rows if row["channel"] in {"upi", "aa"}
    )
    if not gst or not digital:
        return {"status": "missing", "gap": None, "flag": False}
    gap = abs(gst - digital) / max(gst, digital)
    return {
        "status": "available",
        "gst_paise": gst,
        "digital_paise": digital,
        "gap": gap,
        "flag": gap >= policy.gst_gap_review_threshold,
    }


def capacity(
    weeks: list[dict[str, int]],
    features: dict[str, float],
    p_stress: float,
    bank_present: bool,
    policy: Policy,
) -> dict[str, Any]:
    nets = (
        [week["inflow"] - week["outflow"] for week in weeks]
        if bank_present
        else [week["inflow"] for week in weeks]
    )
    lean = min(nets[-4:]) if nets else 0
    lean = max(0, lean) / 4
    base_haircut = (
        policy.base_haircut if bank_present else policy.inflow_only_haircut
    )
    history_factor = min(1.0, features.get("history_weeks", 0) / 13)
    haircut = min(
        policy.max_haircut,
        base_haircut * (1 - p_stress) * history_factor,
    )
    max_emi_weekly = int(lean * haircut)
    periods = policy.tenure_months * (52 / 12)
    rate = policy.annual_rate / 52
    principal = (
        max_emi_weekly * periods
        if rate == 0
        else max_emi_weekly * (1 - (1 + rate) ** (-periods)) / rate
    )
    return {
        "lean_surplus_weekly_paise": int(lean),
        "haircut": haircut,
        "max_emi_weekly_paise": max_emi_weekly,
        "max_principal_paise": int(principal),
        "cadence": "weekly",
        "tenure_months": policy.tenure_months,
        "rate_annual": policy.annual_rate,
        "estimate_type": "net_cashflow" if bank_present else "inflow_only_estimate",
    }


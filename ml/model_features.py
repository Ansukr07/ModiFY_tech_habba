"""Convert uploaded cashflow rows into the trained models' feature vectors."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import median

import numpy as np

AUTH_ORDER = [
    "payer_hhi",
    "max_payer_share",
    "round_amount_ratio",
    "history_weeks",
    "empty_then_spike",
]
STRESS_INFLOW_ORDER = [
    "p10_rel",
    "cv_weekly_inflow",
    "slope_rel",
    "lean_month_ratio",
    "active_week_ratio",
    "cv_missing",
]
STRESS_FULL_ORDER = STRESS_INFLOW_ORDER + ["outflow_ratio", "log1p_unique_payers"]
UNKNOWN_PAYER = "__UNKNOWN_CASH__"


def _parse_t(value) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")[:19])
    except ValueError:
        try:
            return datetime.fromisoformat(str(value)[:10])
        except ValueError:
            return None


def _monday(dt: datetime) -> datetime:
    d = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return d - timedelta(days=d.weekday())


def _amount(row: dict) -> float | None:
    if row.get("inflow_paise") is not None or row.get("outflow_paise") is not None:
        return float(int(row.get("inflow_paise") or 0) + int(row.get("outflow_paise") or 0))
    if row.get("amount") is None:
        return None
    try:
        return float(row["amount"])
    except (TypeError, ValueError):
        return None


def _is_round(amount: float) -> bool:
    return any(math.isclose(amount % unit, 0.0) for unit in (100.0, 500.0, 1000.0))


def _is_digital_credit(row: dict, inflow: float) -> bool:
    if inflow <= 0:
        return False
    rail = str(row.get("source_rail") or row.get("channel") or "upi").lower()
    if any(token in rail for token in ("cash", "pdf", "pension", "interest", "duchod", "urok")):
        return False
    return True


def excluded_row_reason(row: dict) -> str | None:
    if _parse_t(row.get("t") or row.get("ts") or row.get("timestamp")) is None:
        return "invalid_timestamp"
    if row.get("account_id") in (None, "") and row.get("shop_id") in (None, ""):
        if row.get("inflow_paise") is None and row.get("amount") is None:
            return "missing_amount_or_account"
    if _amount(row) is None:
        return "missing_amount"
    return None


def auth_features(cashflows: list[dict], account_id: str | None = None) -> dict:
    credits = []
    excluded = []
    for row in cashflows:
        reason = excluded_row_reason(row)
        if reason == "invalid_timestamp":
            excluded.append({"reason": reason})
            continue
        inflow = float(int(row.get("inflow_paise") or 0))
        if inflow <= 0:
            continue
        dt = _parse_t(row.get("t") or row.get("ts") or row.get("timestamp"))
        payer = row.get("payer_id") or row.get("counterparty_id") or UNKNOWN_PAYER
        currency = row.get("currency") or "INR"
        credits.append({"dt": dt, "payer": str(payer), "amount": inflow / 100.0, "currency": currency, "week": _monday(dt)})
    if not credits:
        return {"vector": {name: math.nan for name in AUTH_ORDER}, "excluded_rows": excluded, "order": AUTH_ORDER}

    counts: dict[str, int] = defaultdict(int)
    for row in credits:
        counts[row["currency"]] += 1
    dominant = max(counts, key=lambda key: (counts[key], -list(counts).index(key)))
    credits = [row for row in credits if row["currency"] == dominant]
    payer_totals: dict[str, float] = defaultdict(float)
    weekly: dict[datetime, float] = defaultdict(float)
    round_n = 0
    for row in credits:
        payer_totals[row["payer"]] += row["amount"]
        weekly[row["week"]] += row["amount"]
        if _is_round(row["amount"]):
            round_n += 1
    total = sum(payer_totals.values())
    shares = [value / total for value in payer_totals.values()] if total else []
    vector = {
        "payer_hhi": sum(share * share for share in shares) if shares else math.nan,
        "max_payer_share": max(shares) if shares else math.nan,
        "round_amount_ratio": (round_n / len(credits)) if credits else math.nan,
        "history_weeks": float(len(weekly)),
        "empty_then_spike": float(_empty_then_spike(weekly)),
    }
    return {"vector": vector, "excluded_rows": excluded, "order": AUTH_ORDER, "currency": dominant, "account_id": account_id}


def _empty_then_spike(weekly: dict[datetime, float]) -> int:
    if not weekly:
        return 0
    weeks = sorted(weekly)
    series = []
    week = weeks[0]
    while week <= weeks[-1]:
        series.append(weekly.get(week, 0.0))
        week += timedelta(weeks=1)
    positives = [value for value in series if value > 0]
    if not positives:
        return 0
    med = median(positives)
    mad = median([abs(value - med) for value in positives])
    threshold = med + 5 * mad
    zeros = 0
    for value in series:
        if value == 0:
            zeros += 1
            continue
        if zeros >= 8 and value > threshold:
            return 1
        zeros = 0
    return 0


def _nan() -> float:
    return math.nan


def stress_features(cashflows: list[dict], variant: str = "B-full") -> dict:
    digital: dict[datetime, float] = defaultdict(float)
    outflow: dict[datetime, float] = defaultdict(float)
    observed: set[datetime] = set()
    payers: set[str] = set()
    excluded = []
    for row in cashflows:
        dt = _parse_t(row.get("t") or row.get("ts") or row.get("timestamp"))
        if dt is None:
            excluded.append({"reason": "invalid_timestamp"})
            continue
        week = _monday(dt)
        observed.add(week)
        inflow = float(int(row.get("inflow_paise") or 0))
        out = float(int(row.get("outflow_paise") or 0))
        if _is_digital_credit(row, inflow):
            digital[week] += inflow
            payers.add(str(row.get("payer_id") or row.get("counterparty_id") or ""))
        outflow[week] += out
    order = STRESS_FULL_ORDER if variant in {"B-full", "full"} else STRESS_INFLOW_ORDER
    empty = {name: _nan() for name in order}
    empty["cv_missing"] = 1.0
    if not observed:
        return {"vector": empty, "excluded_rows": excluded, "order": order, "insufficient_history": True}

    first, last = min(observed), max(observed)
    weeks = []
    week = first
    while week <= last:
        weeks.append(week)
        week += timedelta(weeks=1)
    x_all = [digital[w] for w in weeks]
    o_all = [outflow[w] for w in weeks]
    x = x_all[-26:]
    o = o_all[-26:]
    insufficient = len(x) < 26
    if insufficient:
        vector = {name: _nan() for name in order}
        vector["cv_missing"] = 1.0
        vector["active_week_ratio"] = sum(value > 0 for value in x) / 26.0
        return {"vector": vector, "excluded_rows": excluded, "order": order, "insufficient_history": True, "observed_weeks": len(x)}

    mean = sum(x) / 26.0
    if mean <= 0 or len(x) < 2:
        cv, cv_missing = _nan(), 1.0
    else:
        var = sum((value - mean) ** 2 for value in x) / (len(x) - 1)
        std = math.sqrt(var)
        cv = std / mean if math.isfinite(std) and mean > 0 else _nan()
        cv_missing = 0.0 if math.isfinite(cv) else 1.0
        if not math.isfinite(std):
            cv_missing = 1.0
    blocks = [sum(x[i : i + 4]) for i in (0, 4, 8, 12, 16, 20)]
    m = median(blocks)
    p10_rel = float(np.percentile(x, 10) / m) if m > 0 else _nan()
    last13 = x[-13:]
    mean13 = sum(last13) / 13.0
    if mean13 <= 0:
        slope_rel = _nan()
    else:
        xs = list(range(13))
        mx = sum(xs) / 13.0
        my = mean13
        den = sum((i - mx) ** 2 for i in xs) or 1.0
        slope = sum((i - mx) * (y - my) for i, y in zip(xs, last13)) / den
        slope_rel = slope / mean13
    rolls = [sum(x[i : i + 4]) for i in range(23)]
    med_roll = median(rolls)
    lean = min(rolls) / med_roll if med_roll > 0 else _nan()
    vector = {
        "p10_rel": p10_rel,
        "cv_weekly_inflow": cv,
        "slope_rel": slope_rel,
        "lean_month_ratio": lean,
        "active_week_ratio": sum(value > 0 for value in x) / 26.0,
        "cv_missing": cv_missing,
    }
    if order is STRESS_FULL_ORDER:
        sx = sum(x)
        vector["outflow_ratio"] = min(5.0, max(0.0, sum(o) / sx)) if sx > 0 else _nan()
        vector["log1p_unique_payers"] = math.log1p(len(payers))
    return {"vector": vector, "excluded_rows": excluded, "order": order, "insufficient_history": False}


def ordered_row(bundle: dict) -> list[float]:
    return [bundle["vector"].get(name, math.nan) for name in bundle["order"]]

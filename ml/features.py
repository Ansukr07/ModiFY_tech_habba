"""Shared feature builder. Node must not recompute these."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta


VERIFIED = {"verified", "verified_simulated"}


def _parse_t(t: str) -> datetime:
    return datetime.fromisoformat(str(t)[:10])


def weekly_nets(cashflows: list[dict]) -> list[tuple[datetime, int]]:
    buckets: dict[datetime, int] = defaultdict(int)
    for row in cashflows:
        d = _parse_t(row["t"])
        week = d - timedelta(days=d.weekday())
        buckets[week] += int(row.get("inflow_paise") or 0) - int(row.get("outflow_paise") or 0)
    return sorted(buckets.items())


def rolling_4(nets: list[tuple[datetime, int]]) -> list[int]:
    vals = [n for _, n in nets]
    if len(vals) < 4:
        return vals[:]
    return [sum(vals[i : i + 4]) for i in range(len(vals) - 3)]


def verified_rail_count(rails: list[dict]) -> int:
    n = 0
    for r in rails:
        t = r.get("type") or r.get("rail_type")
        trust = r.get("trust_class") or r.get("trustClass") or ""
        if t == "pdf":
            continue
        if trust in VERIFIED:
            n += 1
    return n


def build_features(shop: dict, rails: list[dict], cashflows: list[dict]) -> dict:
    vrc = verified_rail_count(rails)
    by_payer: dict[str, int] = defaultdict(int)
    round_n = 0
    n_in = 0
    weeks = set()
    gst_sales = 0
    upi_in = 0
    for r in rails:
        payload = r.get("payload") or {}
        if (r.get("type") == "gst") and "taxable_sales_paise" in payload:
            gst_sales += int(payload["taxable_sales_paise"])
    for row in cashflows:
        inflow = int(row.get("inflow_paise") or 0)
        if inflow > 0:
            n_in += 1
            pid = str(row.get("payer_id") or "unknown")
            by_payer[pid] += inflow
            if inflow % 100000 == 0:
                round_n += 1
            rail = str(row.get("source_rail") or "")
            if "upi" in rail or not rail:
                upi_in += inflow
        if row.get("t"):
            d = _parse_t(row["t"])
            weeks.add((d - timedelta(days=d.weekday())).date())

    total_in = sum(by_payer.values())
    shares = [v / total_in for v in by_payer.values()] if total_in else []
    payer_hhi = sum(s * s for s in shares)
    max_payer_share = max(shares) if shares else None
    round_amount_ratio = (round_n / n_in) if n_in else None
    gst_upi_rel_gap = None
    if gst_sales:
        gst_upi_rel_gap = abs(gst_sales - upi_in) / max(gst_sales, 1)

    nets = weekly_nets(cashflows)
    week_inflows = []
    for row in cashflows:
        pass
    inflow_weeks: dict[datetime, int] = defaultdict(int)
    outflow_weeks: dict[datetime, int] = defaultdict(int)
    for row in cashflows:
        d = _parse_t(row["t"])
        w = d - timedelta(days=d.weekday())
        inflow_weeks[w] += int(row.get("inflow_paise") or 0)
        outflow_weeks[w] += int(row.get("outflow_paise") or 0)

    observed = sorted(set(inflow_weeks) | set(outflow_weeks))
    ordered = []
    if observed:
        week = observed[0]
        while week <= observed[-1]:
            ordered.append(week)
            week += timedelta(weeks=1)
    weekly_in = [inflow_weeks[w] for w in ordered]
    history_weeks = len(ordered)

    empty_then_spike = False
    if len(weekly_in) >= 6:
        early = weekly_in[:3]
        late = weekly_in[-3:]
        if sum(early) == 0 and sum(late) > 0 and max(late) > 5 * (sum(weekly_in) / max(len(weekly_in), 1) + 1):
            empty_then_spike = True

    mean_in = sum(weekly_in) / len(weekly_in) if weekly_in else 0
    if mean_in == 0:
        cv = None
    else:
        var = sum((x - mean_in) ** 2 for x in weekly_in) / len(weekly_in)
        cv = (var ** 0.5) / mean_in

    rolls = rolling_4(nets)
    typical = sorted(rolls)[len(rolls) // 2] if rolls else 0
    worst = min(rolls) if rolls else (nets[0][1] if nets else 0)
    worst_index = rolls.index(worst) if rolls else 0
    lean_month_ratio = (worst / typical) if typical else None

    monthly = []
    by_month: dict[str, int] = defaultdict(int)
    for row in cashflows:
        key = str(row["t"])[:7]
        by_month[key] += int(row.get("inflow_paise") or 0)
    monthly = list(by_month.values())
    monthly.sort()
    median_monthly = monthly[len(monthly) // 2] if monthly else 0
    p10 = sorted(weekly_in)[max(0, int(0.1 * (len(weekly_in) - 1)))] if weekly_in else 0

    # slope last 90d ~ last 12 weeks
    slope = 0.0
    if len(weekly_in) >= 4:
        xs = list(range(len(weekly_in)))
        n = len(xs)
        mx = sum(xs) / n
        my = sum(weekly_in) / n
        den = sum((x - mx) ** 2 for x in xs) or 1
        slope = sum((x - mx) * (y - my) for x, y in zip(xs, weekly_in)) / den

    total_inflow = sum(int(r.get("inflow_paise") or 0) for r in cashflows)
    total_out = sum(int(r.get("outflow_paise") or 0) for r in cashflows)
    outflow_ratio = (total_out / total_inflow) if total_inflow else None

    return {
        "feature_schema_version": "1.0",
        "payer_hhi": payer_hhi,
        "max_payer_share": max_payer_share,
        "round_amount_ratio": round_amount_ratio,
        "gst_upi_rel_gap": gst_upi_rel_gap,
        "history_weeks": history_weeks,
        "empty_then_spike": empty_then_spike,
        "rail_count_verified": vrc,
        "median_monthly_inflow": median_monthly,
        "p10_weekly_inflow": p10,
        "cv_weekly_inflow": cv,
        "slope_90d": slope,
        "lean_month_ratio": lean_month_ratio,
        "outflow_ratio": outflow_ratio,
        "residual_after_opex": total_inflow - total_out,
        "unique_payers": len(by_payer),
        "invoice_count": sum(1 for r in rails if r.get("type") == "gst"),
        "weeks_on_vpa": history_weeks,
        "worst_4_week_net_paise": worst,
        "worst_4_week_start": (nets[worst_index][0].date().isoformat() if nets else None),
        "worst_4_week_end": ((nets[min(worst_index + 3, len(nets) - 1)][0] + timedelta(days=6)).date().isoformat() if nets else None),
        "worst_4_week_dates": [nets[i][0].date().isoformat() for i in range(worst_index, min(worst_index + 4, len(nets)))] if nets else [],
        "typical_4_week_net_paise": typical,
        "weekly_inflows": weekly_in,
    }

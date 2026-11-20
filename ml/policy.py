"""Versioned underwriting policy. Numeric rates are v1 placeholders pending holdout."""

from __future__ import annotations

import json
from pathlib import Path

POLICY_VERSION = "v1"
TICKET_CEILING_PAISE = 30000000  # ₹3 lakh — spec unresolved range; explicit v1 cap
REF_EMI_WEEKLY_PAISE = 150000  # reference EMI for stress target definition (₹1500/week placeholder)

# Placeholder annual rates (bps) until holdout tuning — not frontend examples as authority,
# recorded here as policy v1.
RATE_BPS = {"LOW": 1400, "MID": 1600, "HIGH": 1900}


def load_meta():
    p = Path(__file__).parent / "models" / "meta.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {
        "auth_thresholds": {"low_below": 0.40, "high_at_or_above": 0.75},
        "stress_thresholds": {"low_max": 0.20, "medium_max": 0.45},
        "auth_model_version": "heuristic-v0",
        "stress_model_version": "heuristic-v0",
        "feature_schema_version": "1.0",
        "generator_version": "v1",
    }


def heuristic_p_auth(features: dict) -> float:
    if features.get("empty_then_spike"):
        return 0.12
    mps = features.get("max_payer_share")
    if mps is not None and mps > 0.8:
        return 0.12
    gap = features.get("gst_upi_rel_gap")
    if gap is not None and gap > 0.35:
        return 0.55
    r = features.get("round_amount_ratio")
    if r is not None and r > 0.7:
        return 0.35
    return 0.91


def heuristic_p_stress(features: dict) -> float:
    ratio = features.get("lean_month_ratio")
    cv = features.get("cv_weekly_inflow") or 0
    if ratio is None:
        return 0.55
    p = 0.15
    if ratio < 0.5:
        p += 0.35
    elif ratio < 0.65:
        p += 0.12
    if cv > 0.6:
        p += 0.15
    if (features.get("slope_90d") or 0) < 0:
        p += 0.08
    return min(0.95, p)


def authenticity_band(p: float, meta: dict) -> str:
    th = meta["auth_thresholds"]
    if p < th["low_below"]:
        return "LOW"
    if p >= th["high_at_or_above"]:
        return "HIGH"
    return "MID"


def stress_band(p: float, meta: dict) -> str:
    th = meta["stress_thresholds"]
    if p <= th["low_max"]:
        return "LOW"
    if p <= th["medium_max"]:
        return "MID"
    return "HIGH"


def haircut(trust_high: bool, band: str, history_weeks: int) -> float:
    if not trust_high:
        return 0.0
    if history_weeks < 8:
        h = {"LOW": 0.40, "MID": 0.28, "HIGH": 0.18}[band]
    else:
        h = {"LOW": 0.50, "MID": 0.35, "HIGH": 0.22}[band]
    return h


def pv_principal(payment: int, periods: int, annual_bps: int, cadence: str) -> int:
    if periods <= 0 or payment <= 0:
        return 0
    if cadence == "weekly":
        r = (annual_bps / 10000) / 52
        n = periods
    else:
        r = (annual_bps / 10000) / 12
        n = periods
    if r == 0:
        return payment * n
    prin = payment * (1 - (1 + r) ** (-n)) / r
    return int(prin)  # conservative truncate paise


def installment(principal: int, periods: int, annual_bps: int, cadence: str) -> int:
    if principal <= 0 or periods <= 0:
        return 0
    r = (annual_bps / 10000) / (52 if cadence == "weekly" else 12)
    return round(principal / periods if r == 0 else principal * r / (1 - (1 + r) ** (-periods)))


def underwrite(features: dict, rails: list[dict], requested: int, identity_ok: bool, identity_mismatch: bool):
    from features import verified_rail_count

    meta = load_meta()
    vrc = verified_rail_count(rails)
    not_run = None
    p_auth = p_stress = None
    a_band = s_band = None

    if identity_mismatch:
        return early("DECLINE", "identity_mismatch", requested, meta, vrc, features)

    if not identity_ok:
        return early("UNVERIFIED", "incomplete_identity", requested, meta, vrc, features)

    if vrc == 0:
        return early("UNVERIFIED", "no_verified_rail", requested, meta, vrc, features)

    p_auth = heuristic_p_auth(features)
    a_band = authenticity_band(p_auth, meta)
    if a_band == "LOW":
        return early("DECLINE", "authenticity_low", requested, meta, vrc, features, p_auth, a_band)

    p_stress = heuristic_p_stress(features)
    s_band = stress_band(p_stress, meta)
    hist = int(features.get("history_weeks") or 0)
    trust_high = vrc >= 2 and a_band == "HIGH"
    h = haircut(trust_high, s_band, hist)
    worst = int(features.get("worst_4_week_net_paise") or 0)
    lean_weekly = worst // 4
    max_pay = max(0, int(lean_weekly * h))
    if max_pay <= 0:
        return early("DECLINE", "zero_surplus", requested, meta, vrc, features, p_auth, a_band, p_stress, s_band)

    if s_band == "HIGH" and not trust_high:
        cadence, tenure_mo, rband = "weekly", 6, "HIGH"
        verdict = "DECLINE"
        # high stress + weak trust: no offer
        return pack(
            verdict="DECLINE",
            reason=None,
            requested=requested,
            meta=meta,
            vrc=vrc,
            features=features,
            p_auth=p_auth,
            a_band=a_band,
            p_stress=p_stress,
            s_band=s_band,
            max_pay=0,
            principal=0,
            tenure_mo=0,
            cadence="weekly",
            rband="HIGH",
            haircut=h,
            lean_weekly=lean_weekly,
            worst=worst,
            conditions=[],
        )

    if not trust_high:
        cadence, tenure_mo, rband = "weekly", 6, "MID"
        verdict = "THIN_FILE"
    elif hist < 8:
        cadence, tenure_mo, rband = "weekly", 6, s_band if s_band != "HIGH" else "MID"
        verdict = "THIN_FILE"
    elif s_band == "HIGH":
        cadence, tenure_mo, rband = "weekly", 6, "HIGH"
        verdict = "THIN_FILE"
    elif s_band == "MID":
        cadence, tenure_mo, rband = "weekly", 10, "MID"
        verdict = "STANDARD"
    else:
        cadence, tenure_mo, rband = "weekly", 10, "LOW"
        verdict = "STANDARD"

    periods = tenure_mo * (52 if cadence == "weekly" else 12) // 12
    if cadence == "weekly":
        periods = int(tenure_mo * 52 / 12)
    rate = RATE_BPS[rband]
    max_prin = pv_principal(max_pay, periods, rate, cadence)
    max_prin = min(max_prin, TICKET_CEILING_PAISE)
    principal = min(requested, max_prin)
    counter = requested > max_prin
    if principal <= 0:
        verdict = "DECLINE"

    conditions = ["Debit from merchant VPA"]
    if verdict == "THIN_FILE":
        conditions.append("Weekly debit")
    if (features.get("gst_upi_rel_gap") or 0) > 0.35:
        conditions.append("Review GST mismatch in 30 days")
    if (features.get("max_payer_share") or 0) > 0.5:
        conditions.append("Review payer concentration")

    return pack(
        verdict=verdict,
        reason=None,
        requested=requested,
        meta=meta,
        vrc=vrc,
        features=features,
        p_auth=p_auth,
        a_band=a_band,
        p_stress=p_stress,
        s_band=s_band,
        max_pay=max_pay,
        principal=principal,
        tenure_mo=tenure_mo,
        cadence=cadence,
        rband=rband,
        haircut=h,
        lean_weekly=lean_weekly,
        worst=worst,
        conditions=conditions,
        counter=counter,
        periods=periods,
        rate=rate,
        max_principal=max_prin,
    )


def early(verdict, reason, requested, meta, vrc, features, p_auth=None, a_band=None, p_stress=None, s_band=None):
    return pack(
        verdict=verdict,
        reason=reason,
        requested=requested,
        meta=meta,
        vrc=vrc,
        features=features,
        p_auth=p_auth,
        a_band=a_band,
        p_stress=p_stress,
        s_band=s_band,
        max_pay=0,
        principal=0,
        tenure_mo=0,
        cadence="weekly",
        rband=None,
        haircut=0,
        lean_weekly=0,
        worst=int(features.get("worst_4_week_net_paise") or 0),
        conditions=[],
    )


def pack(**k):
    rate = k.get("rate") or (RATE_BPS.get(k["rband"]) if k.get("rband") else 0)
    periods = k.get("periods") or 0
    repayment = installment(k["principal"], periods, rate, k["cadence"]) if k["principal"] > 0 else 0
    return {
        "verdict": k["verdict"],
        "not_run_reason": k.get("reason"),
        "p_auth": k["p_auth"],
        "authenticity_band": k["a_band"],
        "p_stress": k["p_stress"],
        "risk_band": k["s_band"],
        "verified_rail_count": k["vrc"],
        "principal_paise": k["principal"] if k["verdict"] not in ("DECLINE", "UNVERIFIED") else 0,
        "max_emi_paise": k["max_pay"],
        "tenure_months": k["tenure_mo"] if k["principal"] else 0,
        "repayment_periods": periods if k["principal"] else 0,
        "rate_bps": rate if k["principal"] else 0,
        "rate_band": k["rband"],
        "cadence": k["cadence"],
        "repayment_amount_paise": repayment if k["principal"] else 0,
        "total_repayment_paise": repayment * periods if k["principal"] else 0,
        "total_interest_paise": max(0, repayment * periods - k["principal"]) if k["principal"] else 0,
        "conditions": k["conditions"],
        "counteroffer": bool(k.get("counter")),
        "capacity": {
            "worst_4_week_net_paise": k["worst"],
            "worst_4_week_start": k["features"].get("worst_4_week_start"),
            "worst_4_week_end": k["features"].get("worst_4_week_end"),
            "lean_surplus_paise": k["lean_weekly"],
            "period": "week",
            "haircut": k["haircut"],
            "max_emi_paise": k["max_pay"],
            "max_principal_paise": k.get("max_principal", 0),
        },
        "reference_emi_paise": REF_EMI_WEEKLY_PAISE,
        "target_definition": "next_synthetic_lean_period_reference_emi_coverage",
        "versions": {
            "model_auth": k["meta"].get("auth_model_version", "heuristic-v0"),
            "model_stress": k["meta"].get("stress_model_version", "heuristic-v0"),
            "policy": POLICY_VERSION,
            "feature_schema": k["meta"].get("feature_schema_version", "1.0"),
            "generator": k["meta"].get("generator_version", "v1"),
        },
        "features": {kk: vv for kk, vv in k["features"].items() if kk != "weekly_inflows"},
    }

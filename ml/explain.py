def template_explain(assessment: dict, rails: list) -> dict:
    types = [r.get("type") for r in rails]
    rail_list = ", ".join(types) if types else "no rails"
    v = assessment["verdict"]
    if v == "UNVERIFIED":
        owner = "We could not verify operations. A PDF or typed total does not set a credit limit. Connect simulated AA, UPI, or GST to continue."
        lender = "No verified rail. Policy short-circuit UNVERIFIED before Model B. Principal is zero."
    elif v == "DECLINE":
        owner = "We cannot price this file from the rails we see. This is not a CIBIL score."
        lender = f"Decline. not_run_reason={assessment.get('not_run_reason')}. No positive principal."
    else:
        owner = (
            f"The application has no credit bureau file. Assessment uses {rail_list}. "
            f"Proposed amount is limited by the weakest observed four-week cash-flow period."
        )
        lender = (
            f"Verdict {v}. p_auth={assessment.get('p_auth')} p_stress={assessment.get('p_stress')}. "
            "Amounts come from policy.py, not an LLM."
        )
    return {
        "owner": owner,
        "lender": lender,
        "source_references": ["policy.py", "features.py", "rails"],
        "fallback_used": True,
    }


def drivers_from_features(features: dict) -> list:
    out = []
    if features.get("lean_month_ratio") is not None:
        out.append(
            {
                "feature": "lean_month_ratio",
                "value": features["lean_month_ratio"],
                "text": "The weakest four-week period is compared with a typical period.",
                "direction": "risk_up_if_low",
                "source": "features.py",
            }
        )
    if features.get("max_payer_share") is not None:
        out.append(
            {
                "feature": "max_payer_share",
                "value": features["max_payer_share"],
                "text": "Largest payer share of incoming credits.",
                "direction": "auth_down_if_high",
                "source": "features.py",
            }
        )
    if features.get("gst_upi_rel_gap") is not None:
        out.append(
            {
                "feature": "gst_upi_rel_gap",
                "value": features["gst_upi_rel_gap"],
                "text": "GST summary versus UPI evidence.",
                "direction": "haircut_if_high",
                "source": "features.py",
            }
        )
    if features.get("history_weeks") is not None and len(out) < 3:
        out.append(
            {
                "feature": "history_weeks",
                "value": features["history_weeks"],
                "text": "Weeks with observed activity.",
                "direction": "thin_file_if_short",
                "source": "features.py",
            }
        )
    return out[:3]

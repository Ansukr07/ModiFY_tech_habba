from zerocibil.tools.explanations import reconstruct


def template_explain(assessment: dict, rails: list) -> dict:
    del rails
    return reconstruct(assessment)


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

"""Versioned prototype settings. Values require domain review before use."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Policy:
    version: str = "prototype-0.1"
    authenticity_low_max: float = 0.40
    authenticity_high_min: float = 0.75
    stress_low_max: float = 0.20
    stress_medium_max: float = 0.45
    gst_gap_review_threshold: float = 0.20
    base_haircut: float = 0.35
    inflow_only_haircut: float = 0.20
    annual_rate: float = 0.24
    tenure_months: int = 12
    max_haircut: float = 0.50


DEFAULT_POLICY = Policy()


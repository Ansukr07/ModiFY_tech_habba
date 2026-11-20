"""Read-only connection to the ML scoring service."""

import os
from math import isfinite
from typing import Any


class ScoringError(RuntimeError):
    """Raised when the configured scoring service cannot be reached."""


def _checked_score(value: Any) -> float:
    """Reject missing, malformed, or out-of-range model output."""
    try:
        probability = float(value)
    except (TypeError, ValueError) as exc:
        raise ScoringError("Scoring response has no valid probability") from exc
    if not isfinite(probability) or not 0 <= probability <= 1:
        raise ScoringError("Scoring probability must be between 0 and 1")
    return probability


def _feature_number(features: dict[str, Any], name: str) -> float:
    """Read one numeric input and reject NaN or infinity."""
    try:
        value = float(features.get(name, 0))
    except (TypeError, ValueError) as exc:
        raise ScoringError(f"Feature {name} must be numeric") from exc
    if not isfinite(value):
        raise ScoringError(f"Feature {name} must be finite")
    return value


def score(
    model: str,
    features: dict[str, Any],
    variant: str | None = None,
) -> tuple[float, str]:
    """Return a model score and version, or a labelled demo estimate."""
    if model not in {"authenticity", "stress"}:
        raise ScoringError(f"Unknown model: {model}")
    try:
        from artifacts import score_model

        value, version = score_model(model, features, variant)
        return _checked_score(value), version
    except Exception:
        pass
    service_url = os.getenv("ZERO_CIBIL_SCORE_URL")
    if service_url:
        try:
            import httpx

            response = httpx.post(
                f"{service_url.rstrip('/')}/score",
                json={
                    "model": model,
                    "features": features,
                    "variant": variant,
                },
                timeout=8,
            )
            response.raise_for_status()
            body = response.json()
            key = "p_auth" if model == "authenticity" else "p_stress"
            if not isinstance(body, dict):
                raise ScoringError("Scoring response must be a JSON object")
            value = _checked_score(body.get(key, body.get("probability")))
            version = str(body.get("model_version", "unknown"))
            return value, version
        except ScoringError:
            raise
        except Exception as exc:
            raise ScoringError(f"Scoring service unavailable: {exc}") from exc

    if model == "authenticity":
        risk = 0.15
        risk += 0.45 * _feature_number(features, "empty_then_spike")
        risk += 0.35 * _feature_number(features, "gst_upi_rel_gap")
        probability = 1.0 - min(1.0, max(0.0, risk))
        return _checked_score(probability), "demo-heuristic-auth-v1"

    risk = 0.50
    risk -= 0.5 * _feature_number(features, "lean_month_ratio")
    risk += 0.3 * _feature_number(features, "cv_weekly_inflow")
    probability = min(1.0, max(0.0, risk))
    return _checked_score(probability), "demo-heuristic-stress-v1"

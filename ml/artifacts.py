"""Load trained joblib pipelines and score spec-aligned feature vectors."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

from model_features import AUTH_ORDER, STRESS_FULL_ORDER, STRESS_INFLOW_ORDER, ordered_row
from zerocibil.observability import traceable

ROOT = Path(__file__).parent
MODELS = ROOT / "models"


class ScoringError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def meta() -> dict:
    return json.loads((MODELS / "meta.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _auth():
    import joblib

    return joblib.load(MODELS / "auth.joblib")


@lru_cache(maxsize=1)
def _stress():
    import joblib

    return joblib.load(MODELS / "stress.joblib")


def _pipeline_and_names(bundle, model: str, variant: str | None):
    if not isinstance(bundle, dict):
        names = AUTH_ORDER if model == "authenticity" else STRESS_FULL_ORDER
        return bundle, None, names, "unknown"
    if model == "authenticity":
        pipe = bundle.get("model_estimator") or bundle.get("pipeline")
        imputer = bundle.get("imputer")
        names = list(bundle.get("feature_names") or AUTH_ORDER)
        version = str(bundle.get("model_version") or "auth-v1")
        return pipe, imputer, names, version
    key = "B-full" if (variant or "B-full") in {"B-full", "full"} else "B-inflow"
    nested = (bundle.get("variants") or {}).get(key) or bundle
    pipe = nested.get("model") if isinstance(nested, dict) else nested
    names = list((nested.get("features") if isinstance(nested, dict) else None) or (STRESS_FULL_ORDER if key == "B-full" else STRESS_INFLOW_ORDER))
    version = str(bundle.get("model_version") or meta().get("stress_model_version") or "stress-v1")
    return pipe, None, names, version


def _positive_class_score(pipe, imputer, names: list[str], row: list[float]) -> float:
    import pandas as pd

    frame = pd.DataFrame([row], columns=names)
    if imputer is not None:
        cols = getattr(imputer, "feature_names_in_", names)
        frame = pd.DataFrame(imputer.transform(frame[list(cols)]), columns=list(cols))
    if hasattr(pipe, "predict_proba"):
        proba = pipe.predict_proba(frame)[0]
        if len(proba) == 1:
            return float(proba[0])
        classes = list(getattr(pipe, "classes_", [0, 1]))
        if 1 in classes:
            return float(proba[classes.index(1)])
        return float(proba[-1])
    if hasattr(pipe, "decision_function"):
        value = float(pipe.decision_function(frame)[0])
        return 1.0 / (1.0 + math.exp(-value))
    return float(pipe.predict(frame)[0])


@traceable(name="ml.model_inference", run_type="tool")
def score_model(model: str, features: dict, variant: str | None = None) -> tuple[float, str]:
    if model not in {"authenticity", "stress"}:
        raise ScoringError(f"Unknown model: {model}")
    bundle = _auth() if model == "authenticity" else _stress()
    pipe, imputer, names, version = _pipeline_and_names(bundle, model, variant)
    if pipe is None:
        raise ScoringError("Model artifact has no pipeline")
    row = [float(features[name]) if features.get(name) is not None else math.nan for name in names]
    raw = _positive_class_score(pipe, imputer, names, row)
    if not math.isfinite(raw):
        raise ScoringError("Model returned a non-finite score")
    if model == "authenticity":
        # Artifact positive class is suspicious; product p_auth is authenticity.
        raw = 1.0 - raw
    return max(0.0, min(1.0, raw)), version


def score_feature_bundle(model: str, bundle: dict, variant: str | None = None) -> tuple[float, str]:
    features = bundle.get("vector") or bundle
    return score_model(model, features, variant)

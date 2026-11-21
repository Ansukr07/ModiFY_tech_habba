from __future__ import annotations

import copy
import hashlib
import hmac
import json
import math
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")
sys.path.insert(0, str(ROOT))

from artifacts import ScoringError, score_model

def _json_safe(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value
from explain import drivers_from_features, template_explain
from features import build_features, verified_rail_count
from model_features import auth_features, stress_features
from policy import load_meta, underwrite
from zerocibil.tools.explanations import reconstruct
from zerocibil.observability import configure_tracing, traceable

SCORER_API_KEY = os.getenv("SCORER_API_KEY", "")
PRODUCTION = os.getenv("APP_ENV", "development").lower() == "production"
if PRODUCTION and len(SCORER_API_KEY) < 32:
    raise RuntimeError("SCORER_API_KEY must be at least 32 characters when APP_ENV=production")


def require_scorer_key(x_scorer_key: str | None = Header(default=None)):
    if PRODUCTION and (not x_scorer_key or not hmac.compare_digest(x_scorer_key, SCORER_API_KEY)):
        raise HTTPException(status_code=401, detail="SCORER_UNAUTHORIZED")


app = FastAPI(title="ZeroCIBIL score", version="0.1.0", dependencies=[Depends(require_scorer_key)])


class ScoreIn(BaseModel):
    application_id: str
    shop: dict
    rails: list[dict] = Field(default_factory=list)
    cashflows: list[dict] = Field(default_factory=list)
    documents: list[dict] = Field(default_factory=list)
    requested_amount_paise: int
    policy_version: str = "v1"


class StressIn(BaseModel):
    application_id: str
    shop: dict
    rails: list[dict] = Field(default_factory=list)
    cashflows: list[dict] = Field(default_factory=list)
    requested_amount_paise: int
    policy_version: str = "v1"
    lean_inflow_delta_pct: float = Field(ge=-48, le=0)
    outflow_delta_pct: float = Field(default=0, ge=0, le=30)
    base_decision_id: str | None = None


def _forbid_protected(obj):
    blob = json.dumps(obj)
    if "cibilScore" in blob or "cibil_score" in blob:
        raise HTTPException(400, "CIBIL_NOT_ALLOWED")
    if "ownerFlags" in blob:
        raise HTTPException(400, "PROTECTED_ATTR_IN_SCORE")


def _identity(shop: dict, rails: list[dict]):
    name = shop.get("name") or shop.get("shop_id")
    mismatch = False
    for r in rails:
        payload = r.get("payload") or {}
        if payload.get("identity_match") is False:
            mismatch = True
        if r.get("identity_match") is False:
            mismatch = True
    ok = bool(name)
    return ok, mismatch


@traceable(name="ml.score_models", run_type="chain")
def _model_scores(cashflows: list[dict]) -> dict:
    auth = auth_features(cashflows)
    stress = stress_features(cashflows, "B-full")
    scores = {"auth_input": auth, "stress_input": stress}
    try:
        p_auth, auth_version = score_model("authenticity", auth["vector"])
        scores["p_auth"] = p_auth
        scores["auth_version"] = auth_version
        scores["auth_variant"] = "ml/models/auth.joblib"
    except Exception:
        scores["p_auth"] = None
    try:
        p_stress, stress_version = score_model("stress", stress["vector"], "B-full")
        scores["p_stress"] = p_stress
        scores["stress_version"] = stress_version
        scores["stress_variant"] = "ml/models/stress.joblib:B-full"
    except Exception:
        scores["p_stress"] = None
    return scores


@traceable(name="ml.run_score", run_type="chain")
def run_score(body: dict, scores: dict | None = None) -> dict:
    _forbid_protected({"shop": {k: v for k, v in body["shop"].items() if k != "ownerFlags"}, "rails": body["rails"]})
    shop = {k: v for k, v in body["shop"].items() if k != "ownerFlags"}
    rails = body["rails"]
    cfs = body["cashflows"]
    requested = int(body["requested_amount_paise"])
    if requested < 0 or requested != requested:
        raise HTTPException(400, "VALIDATION")
    feats = build_features(shop, rails, cfs)
    ident_ok, mismatch = _identity(shop, rails)
    scores = scores or _model_scores(cfs)
    # Trained scores are uncalibrated on Indian MSME/UPI data. Policy arithmetic
    # stays on the versioned heuristic until a domain-reviewed threshold is set.
    result = underwrite(feats, rails, requested, ident_ok, mismatch)
    if scores.get("auth_version"):
        result.setdefault("versions", {})["model_auth"] = scores["auth_version"]
    if scores.get("stress_version"):
        result.setdefault("versions", {})["model_stress"] = scores["stress_version"]
    result["model_scores"] = {
        "p_auth": scores.get("p_auth"),
        "p_stress": scores.get("p_stress"),
        "auth_version": scores.get("auth_version"),
        "stress_version": scores.get("stress_version"),
        "auth_artifact": scores.get("auth_variant"),
        "stress_artifact": scores.get("stress_variant"),
        "note": "Uncalibrated trained scores. Policy verdicts still use the versioned heuristic until a domain-reviewed threshold is set.",
    }
    drv = drivers_from_features(feats)
    expl = reconstruct({
        **result,
        "policy_version": body.get("policy_version", "v1"),
        "model_versions": result.get("versions", {}),
        "p_auth": scores.get("p_auth"),
        "p_stress": scores.get("p_stress"),
        "model_scores": result.get("model_scores"),
    })
    raw = json.dumps(body, sort_keys=True, default=str)
    h = hashlib.sha256(raw.encode()).hexdigest()
    out = {
        "application_id": body["application_id"],
        "provenance": "synthetic",
        "identity_state": "mismatch" if mismatch else ("ok" if ident_ok else "incomplete"),
        "verified_rail_count": verified_rail_count(rails),
        "flags": [],
        "drivers": drv,
        "verification_requests": [],
        "explanation": expl,
        "input_hash": h,
        "scenario_only": False,
        **result,
        "model_input": _json_safe({
            "auth": scores.get("auth_input", {}).get("vector"),
            "stress": scores.get("stress_input", {}).get("vector"),
            "auth_excluded_rows": len(scores.get("auth_input", {}).get("excluded_rows") or []),
            "stress_insufficient_history": scores.get("stress_input", {}).get("insufficient_history"),
        }),
        "model_scores": _json_safe(result.get("model_scores")),
    }
    if out["verdict"] in ("UNVERIFIED", "DECLINE"):
        out["principal_paise"] = 0
        out["rate_bps"] = 0
        out["tenure_months"] = 0
        out["repayment_amount_paise"] = 0
        out["max_emi_paise"] = 0
    if result.get("not_run_reason") in ("no_verified_rail", "incomplete_identity"):
        if result["not_run_reason"] == "no_verified_rail":
            out["p_stress"] = None
            out["risk_band"] = None
            out["not_run_reason"] = "no_verified_rail"
    return out


@app.get("/health")
def health():
    meta = load_meta()
    return {
        "status": "ok",
        "models": {
            "auth": meta.get("auth_model_version"),
            "stress": meta.get("stress_model_version"),
        },
        "policy": "v1",
        "feature_schema": meta.get("feature_schema_version", "1.0"),
        "ready": True,
    }


@app.post("/score")
@app.post("/internal/score")
def score(body: dict):
    if body.get("model") and isinstance(body.get("features"), dict):
        try:
            value, version = score_model(body["model"], body["features"], body.get("variant"))
        except ScoringError as exc:
            raise HTTPException(503, str(exc)) from exc
        key = "p_auth" if body["model"] == "authenticity" else "p_stress"
        return {key: value, "probability": value, "model_version": version}
    return run_score(ScoreIn.model_validate(body).model_dump())


@app.post("/explain")
def explain(body: dict):
    return {"explanation": reconstruct(body)}


@app.post("/stress-test")
def stress(body: StressIn):
    data = body.model_dump()
    cfs = copy.deepcopy(data["cashflows"])
    din = 1 + data["lean_inflow_delta_pct"] / 100.0
    dout = 1 + data["outflow_delta_pct"] / 100.0
    if din <= 0:
        raise HTTPException(422, "lean_inflow_delta_pct out of bounds")
    for row in cfs:
        row["inflow_paise"] = int(int(row.get("inflow_paise") or 0) * din)
        row["outflow_paise"] = int(int(row.get("outflow_paise") or 0) * dout)
    scored = run_score({**data, "cashflows": cfs})
    scored["scenario_only"] = True
    scored["scenario_assumptions"] = {
        "lean_inflow_delta_pct": data["lean_inflow_delta_pct"],
        "outflow_delta_pct": data["outflow_delta_pct"],
        "base_decision_id": data.get("base_decision_id"),
    }
    return scored


def _run_agent(payload: dict) -> dict:
    repo = ROOT.parent
    agentic = repo / "Agentic"
    if str(agentic) not in sys.path:
        sys.path.insert(0, str(agentic))
        sys.path.insert(0, str(repo))
    from graph import build_graph

    rails = []
    for rail in payload.get("rails") or []:
        rails.append({
            **rail,
            "rail_type": rail.get("rail_type") or rail.get("type"),
            "trust_class": rail.get("trust_class") or rail.get("trustClass"),
        })
    graph = build_graph()
    documents = payload.get("documents") or []
    initial_state = {
        "application_id": payload["application_id"],
        "schema_version": "1.0",
        "shop": payload["shop"],
        "rails": rails,
        "cashflows": payload.get("cashflows") or [],
        "documents": documents,
        "policy_version": payload.get("policy_version", "v1"),
    }
    safe_app_id = hashlib.sha256(str(payload["application_id"]).encode()).hexdigest()[:16]
    state = graph.invoke(initial_state, config=configure_tracing(
        "underwriting-agent",
        {
            "application_id_hash": safe_app_id,
            "policy_version": payload.get("policy_version", "v1"),
            "feature_schema_version": "1.0",
            "entrypoint": "internal_agent",
        },
    ))
    extracted = state.get("statement_rows") or []
    score_cashflows = extracted or payload.get("cashflows") or []
    payload = {**payload, "cashflows": score_cashflows}
    scores = _model_scores(score_cashflows)
    if state.get("p_auth") is not None:
        scores["p_auth"] = state["p_auth"]
    if state.get("p_stress") is not None:
        scores["p_stress"] = state["p_stress"]
    out = run_score(payload, scores=scores)
    events = state.get("audit_events") or []
    out["workflow_trace"] = [step.get("stage") for step in state.get("decision_trace", [])] or [event.get("node") or event.get("event") for event in events]
    out["decision_trace"] = state.get("decision_trace", [])
    out["agent_status"] = state.get("status")
    out["auth_gate"] = state.get("auth_gate")
    if state.get("verification_requests"):
        out["verification_requests"] = state["verification_requests"]
    if state.get("statement_intake"):
        out["statement_intake"] = state["statement_intake"]
    agent_detail = {}
    for key in (
        "data_quality",
        "missing_features",
        "feature_variant",
        "reconciliation",
        "supporting_signals",
        "authenticity_flags",
        "stress_drivers",
        "invoice_evidence",
        "human_review",
        "provenance_summary",
        "errors",
        "explanation",
        "decision_trace",
        "model_versions",
        "owner_language",
    ):
        if key in state and state[key] not in (None, [], {}):
            agent_detail[key] = state[key]
    if agent_detail:
        out["agent_detail"] = _json_safe(agent_detail)
    return out


@app.post("/internal/agent")
def agent(body: ScoreIn):
    payload = body.model_dump()
    try:
        return _run_agent(payload)
    except Exception:
        out = run_score(payload)
        out["workflow_trace"] = ["validate", "features", "policy", "decision_trace", "agent_unavailable"]
        return out


@app.post("/internal/fairness")
def fairness(body: dict):
    a = run_score(body["a"])
    b = run_score(body["b"])
    keys = ["verdict", "principal_paise", "rate_bps", "tenure_months", "cadence"]
    deltas = {k: [a.get(k), b.get(k)] for k in keys}
    passed = all(a.get(k) == b.get(k) for k in keys)
    return {"a": a, "b": b, "deltas": deltas, "pass": passed, "policy_version": "v1"}

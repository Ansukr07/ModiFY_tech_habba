from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from explain import drivers_from_features, template_explain
from features import build_features, verified_rail_count
from policy import underwrite

app = FastAPI(title="ZeroCIBIL score", version="0.1.0")


class ScoreIn(BaseModel):
    application_id: str
    shop: dict
    rails: list[dict] = Field(default_factory=list)
    cashflows: list[dict] = Field(default_factory=list)
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


def run_score(body: dict) -> dict:
    _forbid_protected({"shop": {k: v for k, v in body["shop"].items() if k != "ownerFlags"}, "rails": body["rails"]})
    shop = {k: v for k, v in body["shop"].items() if k != "ownerFlags"}
    rails = body["rails"]
    cfs = body["cashflows"]
    requested = int(body["requested_amount_paise"])
    if requested < 0 or requested != requested:
        raise HTTPException(400, "VALIDATION")
    feats = build_features(shop, rails, cfs)
    ident_ok, mismatch = _identity(shop, rails)
    result = underwrite(feats, rails, requested, ident_ok, mismatch)
    drv = drivers_from_features(feats)
    expl = template_explain(result, rails)
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
    return {
        "status": "ok",
        "models": "heuristic-v0",
        "policy": "v1",
        "feature_schema": "1.0",
        "ready": True,
    }


@app.post("/score")
@app.post("/internal/score")
def score(body: ScoreIn):
    return run_score(body.model_dump())


@app.post("/explain")
def explain(body: dict):
    rails = body.get("rails") or []
    return {"explanation": template_explain(body, rails), "fallback_used": True}


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


@app.post("/internal/agent")
def agent(body: ScoreIn):
    """LangGraph alias: same scoring path, template explanation (P0)."""
    out = run_score(body.model_dump())
    out["workflow_trace"] = ["validate", "provenance", "features", "policy", "explain", "audit_pending"]
    return out


@app.post("/internal/fairness")
def fairness(body: dict):
    a = run_score(body["a"])
    b = run_score(body["b"])
    keys = ["verdict", "principal_paise", "rate_bps", "tenure_months", "cadence"]
    deltas = {k: [a.get(k), b.get(k)] for k in keys}
    passed = all(a.get(k) == b.get(k) for k in keys)
    return {"a": a, "b": b, "deltas": deltas, "pass": passed, "policy_version": "v1"}

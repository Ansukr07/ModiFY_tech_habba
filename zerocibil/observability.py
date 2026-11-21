"""Optional LangSmith tracing helpers with safe-by-default payloads."""

from __future__ import annotations

import os
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


def tracing_enabled() -> bool:
    return os.getenv("LANGSMITH_TRACING", "").strip().lower() in {"1", "true", "yes", "on"}


def traceable(*, name: str, run_type: str = "chain"):
    """Decorate a function with a LangSmith span when the SDK is installed.

    LangSmith's LangChain callback integration separately captures graph node
    runs; these spans make nested tools and model calls individually visible.
    """
    def decorate(function: F) -> F:
        try:
            from langsmith import traceable as langsmith_traceable
        except ImportError:
            return function
        # Scrub raw function arguments/results: state may contain business and
        # transaction data. Run names and callback metadata remain available.
        return langsmith_traceable(
            name=name,
            run_type=run_type,
            process_inputs=lambda _inputs: {"captured": False},
            process_outputs=lambda outputs: _safe_trace_output(name, outputs),
        )(function)
    return decorate


def _output_value(outputs: Any) -> Any:
    """Unwrap LangSmith's result/output envelopes when present."""
    if isinstance(outputs, dict):
        if "result" in outputs:
            return outputs["result"]
        if set(outputs) == {"output"}:
            return outputs["output"]
    return outputs


def _safe_trace_output(name: str, outputs: Any) -> dict[str, Any]:
    """Expose useful run outcomes while excluding raw transaction payloads."""
    result = _output_value(outputs)

    if name in {"ml.model_inference", "tool.model_score"}:
        if isinstance(result, (tuple, list)) and len(result) == 2:
            return {"prediction": result[0], "model_version": result[1]}

    if name in {"node.authenticity", "node.stress"} and isinstance(result, dict):
        keys = ("p_auth", "p_stress", "authenticity_band", "stress_band", "auth_gate", "model_versions", "status")
        return {key: result[key] for key in keys if key in result}

    if name in {"node.decision_trace", "tool.reconstruct_decision_trace"} and isinstance(result, dict):
        explanation = result.get("explanation", result)
        if isinstance(explanation, dict):
            keys = (
                "kind", "version", "outcome", "status", "stages_executed", "checks",
                "reason_codes", "models", "policy", "verification_requests", "execution",
            )
            return {"decision_trace": {key: explanation[key] for key in keys if key in explanation}}

    if name == "ml.score_models" and isinstance(result, dict):
        keys = ("p_auth", "p_stress", "auth_version", "stress_version", "auth_variant", "stress_variant")
        return {key: result[key] for key in keys if key in result}

    if name in {"route.after_validate", "route.after_normalize", "route.after_authenticity", "route.after_stress"}:
        return {"route": result}

    if name in {"node.validate", "node.fail_closed"} and isinstance(result, dict):
        summary = {key: result[key] for key in ("status", "verdict", "verified_rail_count", "human_review") if key in result}
        if "errors" in result:
            summary["error_codes"] = [item.get("code") for item in result["errors"] if isinstance(item, dict)]
        return summary

    if name in {"node.normalize", "node.financial_analyst"} and isinstance(result, dict):
        quality = result.get("data_quality") or {}
        reconciliation = result.get("reconciliation") or {}
        return {
            "status": result.get("status", "NORMALIZED"),
            "quality_passed": quality.get("passed"),
            "duplicate_count": quality.get("duplicate_count"),
            "invalid_row_count": len(quality.get("invalid_row_indexes") or []),
            "history_weeks": len(result.get("weekly_series") or []),
            "feature_variant": result.get("feature_variant"),
            "missing_feature_count": len(result.get("missing_features") or []),
            "reconciliation_status": reconciliation.get("status"),
            "reconciliation_flag": reconciliation.get("flag"),
        }

    if name == "node.document_intake" and isinstance(result, dict):
        evidence = result.get("invoice_evidence") or {}
        return {
            "document_count": evidence.get("count"),
            "trust_class": evidence.get("trust_class"),
            "missing": evidence.get("missing"),
            "extracted_row_count": (result.get("statement_intake") or {}).get("extracted_rows", 0),
        }

    if name == "node.policy_terms" and isinstance(result, dict):
        return {key: result[key] for key in ("verdict", "terms") if key in result}

    if name == "tool.append_audit_event" and isinstance(result, list):
        last = result[-1] if result else {}
        return {"event_count": len(result), "last_event": last.get("event"), "node": last.get("node"), "policy_version": last.get("policy_version")}

    if name in {"tool.normalize_cashflows", "tool.weekly_series"} and isinstance(result, list):
        return {"record_count": len(result)}

    if name == "tool.quality_check" and isinstance(result, dict):
        return {"passed": result.get("passed"), "duplicate_count": result.get("duplicate_count"), "invalid_row_count": len(result.get("invalid_row_indexes") or [])}

    if name in {"tool.build_features", "ml.build_features"}:
        if isinstance(result, (tuple, list)) and len(result) == 2 and isinstance(result[0], dict):
            return {"feature_count": len(result[0]), "missing_features": result[1]}
        if isinstance(result, dict):
            return {"feature_count": len(result.get("features") or result), "missing_feature_count": len(result.get("missing_features") or [])}

    if name in {"ml.auth_features", "ml.stress_features"} and isinstance(result, dict):
        vector = result.get("vector") or {}
        return {
            "feature_count": len(vector),
            "excluded_row_count": len(result.get("excluded_rows") or []),
            "insufficient_history": result.get("insufficient_history"),
            "variant": result.get("variant"),
        }

    if name == "tool.reconcile" and isinstance(result, dict):
        return {key: result[key] for key in ("status", "flag") if key in result}

    if name == "tool.capacity" and isinstance(result, dict):
        keys = ("estimate_type", "cadence", "haircut", "max_emi_weekly_paise", "max_principal_paise")
        return {key: result[key] for key in keys if key in result}

    if name == "ml.run_score" and isinstance(result, dict):
        keys = ("verdict", "p_auth", "p_stress", "principal_paise", "rate_bps", "tenure_months", "not_run_reason")
        return {key: result[key] for key in keys if key in result}

    return {"captured": False}


def configure_tracing(project_name: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return tracing config for LangGraph; environment controls network use."""
    enabled = tracing_enabled()
    tags = ["zerocibil", "agentic", "ml"]
    if os.getenv("LANGSMITH_TAGS"):
        tags.extend(tag.strip() for tag in os.environ["LANGSMITH_TAGS"].split(",") if tag.strip())
    config: dict[str, Any] = {
        "run_name": project_name,
        "tags": tags,
        "metadata": {"service": project_name, **(metadata or {})},
    }
    config["metadata"]["langsmith_project"] = os.getenv("LANGSMITH_PROJECT", "zerocibil")
    return config


def safe_feature_summary(features: dict[str, Any]) -> dict[str, Any]:
    """Keep feature values out of traces unless explicitly opted in."""
    result: dict[str, Any] = {"feature_names": sorted(features), "feature_count": len(features)}
    if os.getenv("LANGSMITH_CAPTURE_FEATURE_VALUES", "").lower() in {"1", "true", "yes", "on"}:
        result["features"] = features
    return result

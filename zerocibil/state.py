"""Typed shared state for the LangGraph workflow."""

from typing import Any, NotRequired, TypedDict


class UnderwritingState(TypedDict):
    application_id: str
    schema_version: str
    shop: dict[str, Any]
    rails: list[dict[str, Any]]
    cashflows: list[dict[str, Any]]
    documents: NotRequired[list[dict[str, Any]]]
    statement_rows: NotRequired[list[dict[str, Any]]]
    statement_intake: NotRequired[dict[str, Any]]
    statement_rows: NotRequired[list[dict[str, Any]]]
    statement_intake: NotRequired[dict[str, Any]]
    errors: NotRequired[list[dict[str, Any]]]
    status: NotRequired[str]
    verdict: NotRequired[str]
    verified_rail_count: NotRequired[int]
    provenance_summary: NotRequired[dict[str, int]]
    model_versions: NotRequired[dict[str, str]]
    data_quality: NotRequired[dict[str, Any]]
    features: NotRequired[dict[str, Any]]
    feature_variant: NotRequired[str]
    missing_features: NotRequired[list[str]]
    weekly_series: NotRequired[list[dict[str, int]]]
    reconciliation: NotRequired[dict[str, Any]]
    supporting_signals: NotRequired[list[dict[str, Any]]]
    invoice_evidence: NotRequired[dict[str, Any]]
    p_auth: NotRequired[float]
    authenticity_band: NotRequired[str]
    authenticity_flags: NotRequired[list[dict[str, Any]]]
    auth_gate: NotRequired[str]
    verification_requests: NotRequired[list[str]]
    p_stress: NotRequired[float]
    stress_band: NotRequired[str]
    stress_drivers: NotRequired[list[dict[str, Any]]]
    capacity: NotRequired[dict[str, Any]]
    terms: NotRequired[dict[str, Any]]
    explanation: NotRequired[dict[str, Any]]
    audit_events: NotRequired[list[dict[str, Any]]]
    decision_trace: NotRequired[list[dict[str, Any]]]
    human_review: NotRequired[dict[str, Any]]
    owner_language: NotRequired[str]


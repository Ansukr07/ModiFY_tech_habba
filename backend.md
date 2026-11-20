# ZeroCIBIL backend specification

**Status:** Implementation contract derived from [spec.md](spec.md); proposed endpoint additions are explicitly marked. This document does not claim the services already exist.
**Companion:** [frontend.md](frontend.md). Source underwriting rules in `spec.md` take precedence.

## 1. Service ownership and scope

React → Express BFF (`apps/api`) → MongoDB and internal Python services (`ml`). Python owns the single shared feature builder, model inference, deterministic policy, and LangGraph workflow. Node owns sessions, authorization, input validation, application persistence, orchestration calls, and public response shaping. It must not duplicate feature or capacity arithmetic.

Keep three layers separate: Model A estimates authenticity; Model B estimates synthetic lean-period stress against a reference EMI; deterministic policy sets capacity and terms. Agents coordinate typed tools and explain persisted facts. They cannot approve, change model outputs, invent figures, override gates, or disburse. The lender remains accountable.

MVP includes synthetic rail ingestion, dual models, versioned underwriting, scenarios, grounded explanations, evidence, fairness, and audit. Excludes live AA/GST/Aadhaar/CKYC/NACH, real disbursal, real default prediction, consumer loans, and blockchain. Do not claim RBI approval, zero fraud, or live-MSME validation.

## 2. Common API rules

- Public prefix `/api`; JSON requests/responses except tightly controlled supporting uploads. IDs are opaque strings; timestamps are ISO 8601 UTC. All money is integer INR paise within safe numeric bounds; percentages are explicit, probabilities in [0,1], annual rates integer basis points (`rate_bps`, 100 bps = 1%). Never accept NaN, infinity, negative requested amounts, impossible dates, or unknown decision-affecting fields.
- Demo identities are `owner@demo` and `lender@demo`; no production authentication claim. Establish a server-controlled session, return its role through `/api/me`, and enforce ownership/role checks on every resource, including nested shops/rails/applications. Cookie sessions use HttpOnly, SameSite and Secure when HTTPS; validate origin/CSRF for mutations. Restrict CORS to the configured Vite origin; internal services are not browser-accessible.
- Reject `cibilScore` wherever supplied, including nested application/shop data. Protected attributes (`ownerFlags`, gender, area) are forbidden in scoring input and feature vectors. Only isolated fairness fixtures may carry those flags. No bureau lookups.
- Server establishes rail trust from the synthetic adapter and identity checks; the browser cannot self-assert verification. Every record/result includes provenance. `verified_simulated` means verified within the simulation, not a live financial rail.
- Validate content type, body size, rail schema, dates, duplicate source transaction IDs, matching shop IDs, units, and permitted enum values. Supporting files use size/type checks, private storage, safe generated names and download authorization; never execute them. A parser failure yields a data-quality result, never fabricated totals. Typed totals/uploads remain unverified even if parsed.
- Collection responses: `{ items, next_cursor }`, with bounded `limit`; application filters are `status` (workflow), `verdict`, and `cursor`. Owners are scoped automatically. Stable ordering uses creation time and ID.
- Resource responses use `{ data }`; errors use `{ error: { code, message, field_errors?, request_id, retryable } }`. `201` create, `200` successful read/action, `400` malformed/schema input, `401` unauthenticated, `403` forbidden, `404` inaccessible/missing resource, `409` stale/conflicting state, `413` oversized upload, `422` valid JSON that violates domain constraints, `429` rate limit, `503` unavailable model/audit dependency. Avoid leaking other owners' resource existence.
- Require `Idempotency-Key` on application creation, scoring, and overrides. Same actor/key/body returns the original result; same key with changed body returns `409`. Scenario calls are read-only calculations and never overwrite decisions. Rate-limit costly inference and uploads.

## 3. Public Express endpoints

These 13 routes are specified in `spec.md` §8.2. Field lists below define the planned minimum contract; policy values remain server-owned.

| Method and path | Permission | Request / query | Result and side effects |
|---|---|---|---|
| `POST /api/auth/login` | Demo entry | `{ email }`, allowlisted demo identity | Session + safe `{ user: { id, email, role } }`; reject arbitrary role selection |
| `GET /api/me` | Session | — | Current safe user and demo mode |
| `POST /api/shops` | Owner | `{ name, business_type, identity, operating_since }` | New owned shop; server ownership/provenance |
| `GET /api/shops/:id` | Owning owner/lender | — | Safe shop, rail summaries and identity state |
| `POST /api/shops/:id/rails` | Owning owner | `{ type, fixture_id }` for simulated rails; unverified structured payload/upload reference for supporting evidence | Persist validated rail, reconciliation status, trust/provenance; invalidate current assessment freshness when relevant |
| `GET /api/shops/:id/cashflows` | Owning owner/lender | `from`, `to`, `granularity=day\|week` | Window, provenance, raw-derived inflow/outflow/net aggregates and data gaps; no duplicated source inflows |
| `POST /api/applications` | Owning owner | `{ shop_id, requested_amount_paise }` | Submitted application, ID, workflow state; no inferred approval |
| `GET /api/applications` | Session | Workflow/verdict filters, cursor, limit | Owned owner applications or lender queue, rail counts and latest assessment summary |
| `GET /api/applications/:id` | Owning owner/lender | — | Application, workflow, provenance, latest persisted decision, terms, explanation, verification requests and audit reference; owner projection omits private operational details |
| `POST /api/applications/:id/score` | Lender | `{ expected_input_revision, policy_version }` | Compute from an immutable server snapshot, persist decision and audit, return assessment; reject stale revisions |
| `POST /api/applications/:id/override` | Lender | `{ decision_id, action, reason, proposed_terms? }` | Persist actor/reason/original decision and validated lender action + audit; cannot bypass gates or exceed capacity |
| `POST /api/applications/:id/stress` | Lender | `{ decision_id, lean_inflow_delta_pct, outflow_delta_pct }` | Deterministic scenario assessment; `scenario_only: true`; no persisted decision replacement or retraining |
| `GET /api/evidence/summary` | Lender/policy view | — | Versioned synthetic holdout metrics, baseline, funded/offer proxy count, stress among offers, fairness summary, limitations and denominators |

### Proposed additions needed to expose source features

These extend the source route list; they are planned contracts, not pre-existing endpoints. Reuse application detail for verification requests and an existing read view for report content rather than inventing parallel stores.

| Method and path | Permission | Request | Response |
|---|---|---|---|
| `GET /api/applications/:id/audit` | Lender/policy view | Cursor, limit | Chronological immutable events, versions, hashes, original decisions and overrides; redacted sensitive data |
| `POST /api/evidence/fairness` | Lender/policy view | `{ fixture_pair_id, policy_version }`; allowlisted synthetic twins only | Compared outputs, deltas for every term and verdict, pass/fail, versions and audit reference |
| `GET /api/applications/:id/report` | Lender; P1 | — | Persisted underwriting report projection; no new scoring, no invented prose/amounts |

No public arbitrary agent-prompt/tool-execution endpoint. The frontend never calls Python directly. A correction updates authorized evidence on the existing shop, records a revision, and requires re-scoring; old decisions remain visible.

## 4. Assessment and domain schemas

| Entity / Mongo collection | Required information |
|---|---|
| `users` | Demo ID, email, role; no secrets in public projections |
| `shops` | Owner ID, business identity, operating dates, identity state, input revision, provenance |
| `rails` | Shop ID; `aa\|upi\|gst\|udyam\|pdf` plus supporting upload format where needed; `verified_simulated\|supporting\|unverified`; provenance; source adapter/fixture; identity match, timestamps, validation/reconciliation results, private evidence reference |
| `cashflows` | Shop/rail ID, source transaction ID, timestamp, inflow/outflow paise, synthetic payer ID, provenance and generator version; traceable source, no double counting across AA/UPI/GST summaries |
| `applications` | Owner/shop ID, requested paise, workflow state, input revision, latest completed decision ID, verification requests, timestamps |
| `decisions` | Immutable input snapshot/hash, application/revision, model outputs, feature schema/vector, policy/capacity/terms, drivers/explanations, versions, provenance, audit reference |
| `overrides` | Decision/application ID, actor/time/reason/action, prior and proposed/effective terms, gate validation, audit reference; never mutate the original model decision |
| `audit_logs` | Event ID/type, actor/service, timestamp/request ID, application/decision IDs, input hash, versions, outcome/errors and trace reference |

Use indexes for owner/shop/application references, queue order, unique source transaction IDs, and idempotency keys. Evidence reports are versioned files in `ml/reports/`; fairness flags remain in evaluation fixtures, outside operational model inputs. Record input units/windows and raw vs derived facts.

Assessment response fields:

```text
application_id, decision_id, input_revision, assessed_at
provenance, verified_rail_count, identity_state
p_auth, authenticity_band, flags
p_stress, risk_band, reference_emi_paise, target_definition
features, drivers[0..3], verification_requests
capacity: worst_4_week_net_paise, lean_surplus_paise, period,
          haircut, max_emi_paise, max_principal_paise
verdict: DECLINE | UNVERIFIED | THIN_FILE | STANDARD | STEP_UP
principal_paise, max_emi_paise, tenure_months, repayment_periods,
rate_bps, rate_band, cadence, repayment_amount_paise, schedule,
conditions, step_up?, counteroffer
explanation: owner, lender, source_references, fallback_used
versions: model_auth, model_stress, policy, feature_schema, generator
input_hash, audit_reference
```

`max_emi_paise` retains the source API name, but its period must always be explicit; for weekly cadence it is weekly repayment capacity, not a monthly EMI. Schedule rows contain due period/date, principal/interest/total paise and remaining balance. Denied/unverified paths have no positive principal or invented terms; probabilities/features not computed because of an early gate are `null` with `not_run_reason`, never fabricated zero predictions.

Workflow status is separate: `submitted → assessing → assessed`; `needs_review` for recoverable data/verification issues; `failed` for infrastructure failure. A completed non-offer assessment can still have verdict UNVERIFIED/DECLINE. Changes to evidence mark prior assessment stale. A scenario never changes workflow or effective lender action.

## 5. Python and internal routing

Canonical FastAPI routes are from `spec.md` §11:

| Route | Contract |
|---|---|
| `GET /health` | Service/schema/model/policy readiness without PII; report unready if artifacts are unavailable |
| `POST /score` | Input: `application_id`, immutable shop, rails with trust/provenance, cashflows, `requested_amount_paise`, `policy_version`; output: computed assessment contract above |
| `POST /explain` | Input: structured immutable assessment and authorized facts; output: grounded owner/lender explanations with references; deterministic template fallback on LLM failure |
| `POST /stress-test` | Input: base decision snapshot + lean-inflow/outflow deltas; output: assumptions, recomputed surplus/repayment/principal/terms, original model references, `scenario_only: true` |

The architecture diagram also names `POST /internal/score` and `POST /internal/agent`. Resolve this consistently: `/score` is the canonical scoring operation; `/internal/score` is an internal-only alias if needed for that diagram's caller. `POST /internal/agent` is the LangGraph workflow entry, taking a server-loaded application snapshot/request reference and returning the same assessment plus workflow trace. Do not implement separate underwriting logic behind the alias. Express scoring invokes the graph; the graph calls canonical Python scoring/policy tools. Avoid graph→Express→graph recursion.

Proposed internal fairness support: `POST /internal/fairness` runs allowlisted synthetic twins through the exact deployed pipeline and returns their complete comparison. It backs the public fairness endpoint. Service authentication/network isolation, bounded request sizes/timeouts, strict schemas and permitted tool lists apply to all internal calls. Reject incompatible feature/model/policy versions before calculation.

## 6. Underwriting algorithm and terms

1. Validate identity, history, provenance, rail ownership and schema. Incomplete identity needs correction/review; a confirmed identity mismatch is a hard decline. No verified rail short-circuits to UNVERIFIED before Model B or any full-limit offer. MVP uses zero offer for this path until a bounded test-limit policy is explicitly approved.
2. Normalize and reconcile rails deterministically, preserving missingness. Link AA/UPI observations of the same economic transaction; GST is reconciliation evidence, not additional revenue to sum. Flag freshness/replay, round-amount spikes, top-payer concentration and GST discrepancy. Top payer >80% means review/down-term or decline per versioned policy; relative GST gap >0.35 means haircut or unverified. Cash-heavy activity is a verify/penalty consideration, not automatic fraud and not a Model A cash-share feature.
3. Run Model A. Apply meta thresholds (`low_below`, `high_at_or_above`; source placeholders 0.40/0.75 until tuned). Severe authenticity failure produces policy decline/unverified; mid band requests evidence and/or haircuts. Scores alone do not justify a fraud accusation.
4. Build Model B features with the shared Python builder; infer `p_stress` against the documented reference EMI. B does not consume A's probability in sequential MVP. Risk bands use versioned tuned thresholds (source examples 0.20/0.45).
5. Compute observed worst contiguous four-week net from inflow minus outflow, not revenue alone. `lean_surplus_weekly = worst_4_week_net / 4`; `max_repayment_weekly = max(0, lean_surplus_weekly * haircut)`. Haircut depends only on allowed trust/stress/history policy inputs. No surplus means no positive offer. Inadequate history produces uncertainty/THIN_FILE or collect-data treatment according to the approved history rule; do not fill absent weeks with zeros.
6. Use matching repayment periods for present value: `principal = payment * (1 - (1+r)^(-n)) / r`; when `r=0`, `principal = payment*n`. Versioned policy defines annual-rate convention, weekly/monthly conversion, term rounding and number of periods; never reuse a monthly formula unchanged for weekly payments. Round conservatively in paise, reconcile the last schedule payment, and ensure payments stay within capacity.
7. Determine tenure/rate/cadence/conditions from policy. Low stress + high trust: lowest band and 12–18 month cap, weekly or monthly. Mid stress + high trust: mid band, weekly, 9–12 months. High stress: high band/6 months or decline. Low trust: unverified or an explicitly bounded test policy, never a large full limit. Numeric rates/haircuts require holdout tuning; do not invent them in client code.
8. Offered principal cannot exceed requested amount, capacity or configured ticket ceiling. Over-ask yields counteroffer. STEP_UP, when implemented, is a conservative start with N on-time weeks and explicit reassessment conditions; not an automatic unrestricted increase. Persist the complete calculation trail and audit.

A lender override may decline, request evidence, or reduce/adjust terms within the same verified-rail, identity, affordability and policy constraints. Any larger amount requires fresh valid evidence/re-scoring, not an override bypass. Always retain original outcome and human action separately.

Scenarios use the persisted policy and observation snapshot. Apply lean-inflow/outflow percentage changes to the relevant inputs, recompute capacity and schedule only; do not retrain or silently re-score B. Echo assumptions, base decision ID, unchanged model outputs and scenario-only status. Bounds are validated and exposed with policy metadata in assessment responses.

## 7. Synthetic data, features and models

Preserve the source layout: `ml/generate_shops.py`, `features.py`, `schema.json`, `train_auth.py`, `train_stress.py`, `evaluate.py`, `policy.py`, `service.py`, `agent_graph.py`, `agents/`, `tools/`, `models/`, `reports/`, and `data/seed/`.

Generate at least 200 shops (500–1000 if feasible), each with 90–180 days of source activity and derived aggregates. Every row includes `provenance: synthetic` and `generator_version`. Archetypes: stable, seasonal, declining, mule, pdf_only, gst_mismatch, twin_fairness. Include legitimate new/short-history, cash-heavy, festival seasonal, single dominant customer and temporary-spike cases. Seed the six clickable product scenarios described in the frontend plan, including volatile genuine UPI.

| Model | Features / label |
|---|---|
| A authenticity | `payer_hhi`, `max_payer_share`, `round_amount_ratio`, `gst_upi_rel_gap`, `history_weeks`, `empty_then_spike`, `rail_count_verified`; target `y_auth=1` authentic operations vs synthetic mule/pdf_fraud/mismatch labels |
| B stress | `median_monthly_inflow`, `p10_weekly_inflow`, `cv_weekly_inflow`, `slope_90d`, `lean_month_ratio`, `outflow_ratio`, `residual_after_opex`, `unique_payers`, `invoice_count`, `weeks_on_vpa`; target future synthetic lean period fails reference EMI |

Document units, aggregation windows, round-amount rule, missing GST behaviour, zero-mean variability handling, lean-month definition and valid ranges in `schema.json`. Missing verified rails are not zero activity. No protected flags, city-as-risk, requested amount, labels, archetype, or future information in vectors. Shared train/serve code is mandatory.

Train A and B independently: Logistic Regression baseline vs HistGradientBoostingClassifier primary; optional Random Forest. Impute using train-only fit; scale LR only. Split by `shop_id` 70/15/15; keep twins in the same partition to avoid leakage. Fixed seeds and recorded package versions. Optional stacked B may consume only out-of-fold A predictions during training; skip for sequential MVP.

Load `auth.joblib`, `stress.joblib`, and `meta.json` at runtime; never train on scoring/scenario requests. Meta records schema/generator/model versions, seed, thresholds and trained time. Save metrics/confusion/model cards under `ml/reports/`. Driver payloads contain feature name, observed value, comparison, direction, source and version; top three are grounded in computed features/policy. SHAP is optional, and explanatory wording must not imply unsupported causality.

## 8. LangGraph and grounded explanations

Typed state contains application/shop/rails/cashflows, requested paise, provenance, verified count, features, predictions/flags/drivers, capacity/terms/verdict, explanation, fairness result when requested, audit reference, and errors.

```text
START → load/validate → provenance gate
  no verified rails → UNVERIFIED → explain → audit → END
  otherwise → normalize/reconcile → identity checks
    hard fail → decline/review → explain → audit → END
    pass → Model A → authenticity gate → Model B
      → capacity → terms/counteroffer → explain → audit → END
```

Node responsibilities: orchestrator sequences tools; financial analyst parses/reconciles structured rails/invoices; authenticity investigator examines A and deterministic checks and creates verification requests; stress analyst presents observed cashflow/B; terms presenter renders policy amounts/schedule; explainability produces grounded owner/lender copy; fairness/audit performs code comparisons and tracing. Combine nodes when useful without removing their responsibilities. Fairness runs separately in evaluation, not on every owner application.

Typed allowlisted tools: `load_application`, `validate_application`, `build_features`, `build_financial_features`, `score_authenticity`, `score_stress`, `reconcile_financial_rails`, `run_underwriting_policy`, `simulate_repayment_schedule`, `create_verification_request`, `run_fairness_twins`, `write_audit_event`. No shell or arbitrary URLs. Uploaded text is untrusted evidence, never instructions. Amounts/thresholds/probabilities come only from code/artifacts. Explanation failure falls back to templates and retains the valid deterministic assessment.

## 9. Audit, reliability and privacy

Every completed score—including early UNVERIFIED and decline—and every override needs an audit event with input hash, versions, actor/reason where applicable, and immutable decision reference. Record failed attempts as well. Persist decision plus audit atomically where supported, or use a durable recoverable pending workflow; never report complete if audit persistence fails. Retries must not create duplicate decisions/overrides. Canonicalize the input before hashing so replay comparisons are meaningful.

Parser failure: data-quality/UNVERIFIED with specific missing evidence, no fabricated totals. Missing model: fail closed with retry/manual review, no successful offer. Schema mismatch: reject. Audit unavailable: incomplete workflow and service error. LLM unavailable: deterministic explanation fallback. Bounded internal timeouts and safe idempotent retries; request IDs across services. Logs exclude raw evidence/PII and secrets; minimize stored identity data and keep supporting evidence private. In a later real-data rail, consent/retention/access policy must be implemented before ingestion; v1 must not imply that consented production rails exist.

## 10. Evaluation and fairness contracts

Evidence reports include evaluation date/versions, holdout population/class balance, Model A suspicious-class P/R/F1/ROC-AUC/confusion, Model B P/R/F1/ROC-AUC/PR-AUC if imbalanced/Brier/calibration/confusion, by-archetype metrics, FP/FN examples and hard-case limitations. Synthetic proxy stress is never labelled real default risk.

Product comparison: no-CIBIL baseline offers/funds zero; ZeroCIBIL reports count and denominator of offer-eligible holdout shops and synthetic proxy stress among those offers. Explain whether STANDARD/THIN_FILE/STEP_UP count as offers; count only positive valid principals and do not call proposals actual disbursals. Optional median-inflow baseline demonstrates authenticity failure separately.

Twins share identical operational inputs and differ only in protected evaluation flags such as gender/area. Run the same versioned pipeline and compare verdict, principal, rate/band, tenure, cadence and other conditions. Pass only with ₹0 principal difference and identical remaining terms. Flags never enter model/policy vectors; store test evidence and versions, and surface failure without masking it. Missing metrics return unavailable with a reason, never made-up zero/perfect scores.

## 11. Delivery and acceptance

Build in source order: generator/features/tests → offline A/B/holdout/artifacts → API gates/capacity/terms/scenarios → LangGraph/explanation/audit → frontend integration/evidence/fairness. P0 is dual models, rail gate, capacity/terms, scenario, drivers, provenance, baseline, twins and audit. P1 is richer investigation/report/counteroffer wording. Optional SHAP, step-up, extra agents and Docker may wait.

Minimum verification:

- Ownership/role isolation, rejection of `cibilScore` and protected scoring attributes, and inability to promote a client upload to verified.
- Clean kirana computes terms; PDF-only stays UNVERIFIED with no full limit; hard identity mismatch declines; incomplete identity requests correction; zero/negative surplus cannot yield positive capacity.
- Feature tests cover missing rails, missing GST, zero-mean variability, impossible dates, history windows, duplicate transactions and schema consistency. New/cash-heavy/seasonal legitimate cases are reviewed for false positives.
- Capacity tests cover zero interest, weekly/monthly period consistency, money rounding, schedule reconciliation, counteroffer and policy ticket caps. No amount is created by an LLM.
- Scoring loads artifacts without training. Slider is deterministic, keeps original predictions/decision, and worsening lean cashflow cannot raise capacity under unchanged policy.
- Twins have identical complete outputs. Split leakage checks and train-only preprocessing are verified. Metrics/model cards record versions and limitations.
- Score/override idempotency, stale revision rejection, audit failure, model failure, parser failure and explanation fallback are exercised. Every completed decision has traceable audit.
- Seeded end-to-end owner/lender flows expose genuine calculations and synthetic labels, including no-offer cases and evidence denominators.

## 12. Unresolved policy and later features

Before implementing a real offer, explicitly version the ticket ceiling (source discussion ₹50k–₹3 lakh), haircut table, numeric annual rates/rate convention, short-history thresholds, repayment period conversion, data freshness rules, no-rail test-limit exception if any, and step-up conditions. Do not manufacture these values from frontend presentation examples. Threshold examples require holdout tuning.

Later-only concepts from the source: financial digital twin, credit-readiness assistant without approval promises, ongoing stress monitoring, alternative credit passport, portfolio intelligence and multilingual structured-data copilot. No MVP endpoints are promised for them; each needs a separate product/security/data contract before implementation.

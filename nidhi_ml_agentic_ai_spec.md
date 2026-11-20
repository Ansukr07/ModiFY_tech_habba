> **Superseded.** Integrated into [`spec.md`](spec.md) under product name **ZeroCIBIL**. Keep this file only as the original ML draft; edit `spec.md`.

# Nidhi --- ML & Agentic AI Technical Specification

**Project:** F2 --- Credit for the Credit-Invisible\
**Product:** Nidhi / Invisible Underwriting Desk\
**Document type:** ML and Agentic AI implementation specification\
**Version:** 1.0\
**Status:** Working implementation spec for the hackathon prototype\
**Source of truth:** The participant specification
`F2 — Credit for the credit-invisible`. This document expands its ML and
AI sections without changing the product thesis or the agreed MERN +
Python ML architecture.

------------------------------------------------------------------------

## 1. Purpose and scope

Nidhi is an underwriting desk for thin-file MSMEs. It uses consented or
simulated financial rails and operational cash-flow evidence to help a
lender decide:

1.  **Which** businesses may receive an offer, should be declined, or
    need more data.
2.  **How much** principal a business can reasonably support.
3.  **On what terms** the loan may be structured.

The system must distinguish three different responsibilities:

-   **Machine learning:** estimate data authenticity risk and the
    probability of financial stress in a future lean period.
-   **Deterministic underwriting:** calculate affordable repayment
    capacity and map it to loan terms using versioned rules.
-   **Agentic AI:** coordinate analysis tools, investigate exceptions,
    summarize evidence, and explain the result to the owner or lender.

An LLM must not independently approve a loan, invent financial figures,
change model predictions, or override underwriting policy.

### 1.1 In scope for the hackathon MVP

-   Two supervised ML models:
    -   Model A --- Authenticity.
    -   Model B --- Stress / thin-file risk.
-   Synthetic data generator with labelled business archetypes.
-   Shared Python feature builder.
-   Offline model training and evaluation.
-   FastAPI scoring service.
-   Deterministic lean-month capacity and terms engine.
-   A controlled agent workflow for financial analysis, exception
    investigation, explanation, and audit support.
-   Evidence dashboard comparing the product with the
    `no CIBIL → decline` baseline.
-   Fairness twin checks using synthetic profiles.
-   Explicit synthetic / simulated / real data provenance labels.

### 1.2 Out of scope for the hackathon MVP

-   Production Account Aggregator connectivity or real bank login.
-   Live GST portal integration.
-   Aadhaar, CKYC, or real identity verification.
-   Real loan disbursal, NACH, collections, or legal agreements.
-   A claim that the models predict real-world default rates.
-   An LLM making the final credit decision.
-   Automated fraud accusations based solely on an anomaly score.
-   Neural-network or computer-vision claims about detecting every
    forged PDF.

All cash-flow, GST, and Account Aggregator payloads in the initial demo
are synthetic or simulated. The interface and pitch must say so clearly.

------------------------------------------------------------------------

## 2. System design principles

1.  **Authenticity is separate from credit risk.** A business can have
    healthy cash flow but untrustworthy or insufficient evidence; it can
    also have authentic data but weak repayment capacity.
2.  **A bureau score is not required.** The prototype does not use CIBIL
    or another bureau score as an input to its verdict.
3.  **A PDF is not a verified financial rail.** Self-uploaded PDFs,
    photos, spreadsheets, and typed totals are unverified and must not
    set a full credit limit.
4.  **Capacity comes from transparent calculations.** The maximum EMI
    and principal are computed deterministically and shown to the
    lender.
5.  **Risk changes terms; it does not replace capacity math.** The
    stress model contributes to a policy-controlled haircut and rate
    band.
6.  **Agents call tools; they do not fabricate facts.** All numeric
    values come from structured data, feature functions, model
    responses, or deterministic calculations.
7.  **Every result is traceable.** Persist model versions, policy
    version, provenance, input hash, decision output, and human
    overrides.
8.  **Fairness is tested, not asserted.** Synthetic twin profiles with
    the same operational financial data should receive the same offer
    when protected attributes are changed.
9.  **Uncertainty is an acceptable outcome.** The system may return
    `UNVERIFIED` or request more information rather than forcing a score
    or approval.
10. **Synthetic evaluation is not real-world validation.** Metrics must
    be labelled as synthetic holdout results.

------------------------------------------------------------------------

# PART A --- MACHINE LEARNING SPECIFICATION

## 3. ML overview

  ----------------------------------------------------------------------------
  Component      Task             Target         Output         Role in
                                                                underwriting
  -------------- ---------------- -------------- -------------- --------------
  Model A ---    Binary           `y_auth`       `p_auth`       Estimates
  Authenticity   classification                                 whether
                                                                operational
                                                                records
                                                                resemble
                                                                authentic shop
                                                                operations

  Model B ---    Binary           `y_stress`     `p_stress`     Estimates
  Stress         classification                                 whether the
                                                                next synthetic
                                                                lean period
                                                                will fail to
                                                                cover a
                                                                reference EMI

  Feature        Deterministic    None           Structured     Ensures
  builder        transformation                  feature vector consistent
                                                                features in
                                                                training and
                                                                inference

  Evaluation     Offline          Known          Metrics and    Measures model
  pipeline       evaluation       synthetic      reports        behaviour on
                                  labels                        held-out shops
  ----------------------------------------------------------------------------

The two models must be trained and evaluated independently. Model B may
optionally receive `p_auth` as a feature, but the initial implementation
should compare: - **Sequential version:** Model B does not consume
`p_auth`; authenticity is handled as a separate gate / haircut. -
**Stacked version:** Model B consumes Model A's out-of-fold or
inference-time `p_auth`.

Do not train Model B using in-sample predictions from Model A, because
that can introduce leakage.

## 4. Dataset and synthetic data generation

### 4.1 Dataset generator

Create:

``` text
ml/
  generate_shops.py
  features.py
  schema.json
  train_auth.py
  train_stress.py
  evaluate.py
  policy.py
  service.py
  models/
    auth.joblib
    stress.joblib
    meta.json
  reports/
    metrics.json
    model_card_auth.md
    model_card_stress.md
```

The generator should create at least 200 synthetic shops for the
prototype; 500--1,000 is a useful target if time permits. Each shop
should have a sequence of daily or transaction-level records spanning
approximately 90--180 days, with weekly and monthly aggregates derived
from the same source records.

Every generated record must carry:

``` json
{
  "provenance": "synthetic",
  "generator_version": "v1"
}
```

Never mix generated data with real customer data without explicitly
separating provenance and obtaining appropriate authorization.

### 4.2 Required synthetic shop archetypes

  -----------------------------------------------------------------------
  Archetype               Characteristics         Expected treatment
  ----------------------- ----------------------- -----------------------
  `stable`                Consistent inflows,     Potential `STANDARD`
                          reasonable payer        offer
                          diversity, aligned      
                          rails                   

  `seasonal`              Genuine seasonal peaks  Model should recognize
                          and troughs             variability; may be
                                                  `THIN_FILE`

  `declining`             Sustained downward      Higher stress
                          revenue trend or        probability / smaller
                          weakening surplus       capacity

  `mule`                  Extreme payer           Authenticity review or
                          concentration,          decline under hard
                          suspicious spikes,      policy
                          unusual transaction     
                          patterns                

  `pdf_only`              Only user-uploaded PDF  `UNVERIFIED`; no full
                          / typed totals; no      limit
                          verified rail           

  `gst_mismatch`          Material GST-to-UPI /   Flag, haircut, or
                          bank reconciliation gap request more data

  `twin_fairness`         Two otherwise identical Identical underwriting
                          profiles with different terms
                          protected-attribute     
                          flags                   
  -----------------------------------------------------------------------

Include difficult but legitimate cases: - A new genuine business with
short history. - A cash-heavy kirana. - A festival-driven seasonal
business. - A business with one large legitimate customer. - A business
with a temporary transaction spike.

These cases are necessary to expose false positives and limitations. Do
not make every unusual pattern fraudulent by construction.

### 4.3 Data entities

Suggested logical data tables / objects:

**Shop** - `shop_id` - `business_category` - `city` - `years_open` -
`udyam_present` (supporting identity information only) - `merchant_vpa`
(synthetic in demo) - `gstin_reference` (synthetic in demo) -
`owner_flags` (synthetic fairness testing only; never a model input) -
`provenance`

**Rail** - `rail_id` - `shop_id` - `rail_type`:
`aa | upi | gst | udyam | pdf` - `trust_class`:
`verified_simulated | supporting | unverified` - `identity_match` -
`source_timestamp` - `payload_reference` - `provenance`

**Cashflow transaction** - `transaction_id` - `shop_id` -
`source_rail_id` - `timestamp` - `inflow` - `outflow` - `payer_id`
(synthetic pseudonymous identifier) - `transaction_type` - `provenance`

**Shop-level training record** - `shop_id` - engineered feature
columns - `y_auth` - `y_stress` - `generator_archetype` - `provenance`

All money values in application / API / database contracts should use
integer paise. Convert to rupees only for display.

------------------------------------------------------------------------

## 5. Shared feature engineering

Python owns the feature-building logic. The Node / Express API must not
independently recompute the same financial features.

Create `ml/features.py` and document the input/output contract in
`ml/schema.json`.

### 5.1 Model A features --- authenticity

  -----------------------------------------------------------------------
  Feature                 Definition              Notes
  ----------------------- ----------------------- -----------------------
  `payer_hhi`             Sum of squared payer    Higher values indicate
                          shares across incoming  concentration
                          credits                 

  `max_payer_share`       Largest payer's share   Flag high
                          of total incoming       concentration; not
                          credits                 proof of fraud

  `round_amount_ratio`    Share of transactions   Use a documented rule
                          matching configured     and currency unit
                          round-amount patterns   

  `gst_upi_rel_gap`       Relative difference     Define denominator and
                          between comparable GST  missing-data behaviour
                          sales and UPI / bank    
                          evidence                

  `history_weeks`         Number of weeks with    Short history means
                          available transaction   uncertainty, not fraud
                          history                 

  `empty_then_spike`      Indicator for long      Retain supporting time
                          inactivity followed by  window
                          an unusual activity     
                          spike                   

  `rail_count_verified`   Count of verified /     PDF does not count as a
                          simulated-verified      verified rail
                          financial rails         
  -----------------------------------------------------------------------

Additional checks may be retained as deterministic policy signals: - VPA
/ GSTIN / shop identity mismatch. - Source timestamp freshness. -
Duplicate or replayed records. - Claimed cash share requiring supporting
evidence.

**Important:** The source specification treats a large cash claim as a
penalty / verification issue, not as a standalone model feature. Do not
make cash-heavy businesses automatically suspicious.

### 5.2 Model B features --- financial stress

  -----------------------------------------------------------------------
  Feature                             Definition
  ----------------------------------- -----------------------------------
  `median_monthly_inflow`             Median monthly incoming amount over
                                      the observation window

  `p10_weekly_inflow`                 10th percentile of weekly inflow

  `cv_weekly_inflow`                  Standard deviation divided by mean
                                      of weekly inflows; define safe
                                      behaviour when mean is zero

  `slope_90d`                         Trend slope in inflow over the
                                      latest 90 days

  `lean_month_ratio`                  Worst four-week inflow or surplus
                                      relative to a typical four-week
                                      period; use one precise definition
                                      consistently

  `outflow_ratio`                     Total outflow divided by total
                                      inflow over the defined window

  `residual_after_opex`               Inflow remaining after operating
                                      expenses

  `unique_payers`                     Number of distinct payer
                                      identifiers in the observation
                                      window

  `invoice_count`                     Number of invoices in the
                                      observation window

  `weeks_on_vpa`                      Number of weeks with merchant VPA
                                      activity

  `p_auth` (optional)                 Model A probability, only in the
                                      stacked experiment
  -----------------------------------------------------------------------

Do not include the requested loan amount as a predictor of financial
stress in a way that makes large requests appear inherently riskier.
Loan affordability is handled by the capacity engine.

### 5.3 Feature quality requirements

-   Define units and time windows for every feature.
-   Handle missing values consistently between training and inference.
-   Reject malformed values and impossible date ranges.
-   Record feature schema version.
-   Add unit tests for each feature.
-   Do not silently convert missing verified rails into zero financial
    activity.
-   Keep raw source facts separate from derived features.
-   Do not include protected attributes (for example gender) in either
    model's feature vector.

------------------------------------------------------------------------

## 6. Model A --- Authenticity model

### 6.1 Objective

Estimate whether the submitted operational records are consistent with
authentic business operations.

Target:

``` text
y_auth = 1  if generator label is authentic_ops
y_auth = 0  if generator label is mule / pdf_fraud / mismatch
```

The target is a synthetic generator label. It is not ground-truth proof
that real-world records are genuine.

### 6.2 Candidate algorithms

Train and compare: 1. Logistic Regression --- interpretable baseline. 2.
HistGradientBoostingClassifier --- primary nonlinear tabular candidate.
3. Optional RandomForestClassifier --- additional comparison if time
permits.

Use a simple preprocessing pipeline: - Imputation for permitted missing
numeric values. - Scaling for Logistic Regression. - No scaling
requirement for tree-based models. - Fixed random seeds and recorded
package versions.

### 6.3 Output contract

``` json
{
  "model": "authenticity",
  "model_version": "auth-v1",
  "p_auth": 0.93,
  "authenticity_band": "HIGH",
  "flags": [],
  "feature_schema_version": "1.0"
}
```

`p_auth` is a model estimate, not a guarantee. Hard identity failures
and zero verified rails must be handled by policy gates, not hidden
inside a probability.

### 6.4 Thresholds

Store thresholds in `models/meta.json` or a versioned policy file. Do
not hard-code them in multiple services.

Example structure:

``` json
{
  "auth_thresholds": {
    "low_below": 0.40,
    "high_at_or_above": 0.75
  }
}
```

These are placeholders for prototype tuning, not validated production
thresholds. The intermediate band should trigger a haircut, additional
verification, or `UNVERIFIED` according to the versioned policy.

### 6.5 Model A evaluation

Report: - Precision and recall for the suspicious class. - F1-score. -
ROC-AUC. - Confusion matrix. - False-positive review for seasonal,
cash-heavy, and new businesses. - Performance by synthetic archetype.

Recall matters for detecting suspicious cases, but false positives can
exclude genuine MSMEs. Show both.

------------------------------------------------------------------------

## 7. Model B --- Stress / thin-file risk model

### 7.1 Objective

Estimate the probability that the business cannot cover a defined
reference EMI during its next synthetic lean period.

Target:

``` text
y_stress = 1  if next synthetic lean period cannot cover reference EMI
y_stress = 0  otherwise
```

The label must be generated from the future synthetic period by the data
generator. It must not be derived from CIBIL or from a feature that
leaks the future outcome.

This is a **proxy financial-stress target**, not a real-world
loan-default label.

### 7.2 Candidate algorithms

Train and compare: 1. Logistic Regression --- baseline. 2.
HistGradientBoostingClassifier --- primary candidate. 3. Optional
XGBoost / Random Forest only if implementation time and dependencies
allow.

The hackathon stack can remain scikit-learn only.

### 7.3 Output contract

``` json
{
  "model": "stress",
  "model_version": "stress-v1",
  "p_stress": 0.17,
  "risk_band": "LOW",
  "reference_emi": 15000,
  "target_definition": "next_synthetic_lean_period_reference_emi_coverage"
}
```

`risk_band` is assigned by a versioned policy threshold. Do not present
`p_stress` as the probability of defaulting on a real loan.

### 7.4 Thresholds and policy mapping

Store risk thresholds in versioned metadata. Example structure:

``` json
{
  "stress_thresholds": {
    "low_max": 0.20,
    "medium_max": 0.45
  }
}
```

Values are illustrative and must be tuned against the synthetic holdout.
High stress may lead to a higher haircut, shorter tenure, further
review, or decline under policy.

### 7.5 Model B evaluation

Report: - ROC-AUC. - Precision, recall, and F1. - PR-AUC if the positive
class is imbalanced. - Confusion matrix. - Brier score / calibration
plot where feasible. - Proxy stress rate among businesses receiving an
offer. - Results by synthetic archetype.

Do not optimize only for accuracy. A model can achieve high accuracy by
predicting the majority class while failing to identify stressed
businesses.

------------------------------------------------------------------------

## 8. Training, validation, and reproducibility

### 8.1 Split strategy

Split by `shop_id`, not by transaction row. All records belonging to one
synthetic shop must remain in one split to avoid leakage.

Recommended initial split: - 70% train. - 15% validation. - 15% test /
holdout.

Use fixed random seeds. If generator templates are highly repetitive,
add a stress test in which one or more archetypes or parameter ranges
are held out.

### 8.2 Leakage controls

-   Do not use future-period values to calculate historical input
    features.
-   Do not use `y_auth`, `y_stress`, archetype labels, or generator-only
    flags as model inputs.
-   Do not use requested loan amount as a stress feature.
-   Do not split transactions from the same shop across train and test.
-   If using `p_auth` in Model B, generate it out-of-fold for training.
-   Fit imputers, scalers, and other preprocessing only on training
    data.

### 8.3 Reproducible artifacts

Each training run should save: - Serialized model. - Feature names and
order. - Feature schema version. - Training data / generator version. -
Random seed. - Training timestamp. - Hyperparameters. - Evaluation
metrics. - Thresholds and model version.

Suggested `models/meta.json`:

``` json
{
  "feature_schema_version": "1.0",
  "generator_version": "v1",
  "auth_model_version": "auth-v1",
  "stress_model_version": "stress-v1",
  "training_seed": 42,
  "auth_thresholds": {},
  "stress_thresholds": {},
  "trained_at": "ISO-8601 timestamp"
}
```

The runtime service loads the saved artifacts. It must not retrain
models during a user request or during stress-slider interactions.

------------------------------------------------------------------------

## 9. Deterministic underwriting engine

This component is not an ML model and should not be delegated to an LLM.

### 9.1 Hard gates

Apply policy gates before allowing a full limit:

-   Incomplete or contradictory shop identity → `UNVERIFIED` or
    `DECLINE` according to the nature of the issue.
-   Zero verified rails → `UNVERIFIED`; no full limit.
-   Identity mismatch / severe authenticity concern → review or
    `DECLINE` under explicit policy.
-   Maximum affordable EMI approximately zero → `DECLINE` or no offer.

PDF-only applications cannot receive a `STANDARD` full limit.

### 9.2 Lean-month capacity

The participant specification defines:

``` text
lean_surplus = worst_4_week_net_inflow / 4
haircut = f(trust_class, p_stress, history_length)
max_emi = max(0, lean_surplus * haircut)
max_principal = pv(max_emi, rate, tenure)
```

Implementation requirements: - Define exactly how
`worst_4_week_net_inflow` is computed from inflow and outflow records. -
Convert the four-week result to a monthly-equivalent amount
consistently. - Ensure existing obligations and required operating
liquidity are considered where represented in the input data. - Keep
haircut values in a versioned policy table. - Do not allow a negative
surplus to produce a positive EMI. - Use a numerically safe
present-value function and handle a zero interest rate separately. - For
weekly repayment, calculate using weekly periods and weekly rate
assumptions; do not apply a monthly formula unchanged.

### 9.3 Terms mapping

Output fields: - Verdict:
`DECLINE | UNVERIFIED | THIN_FILE | STANDARD | STEP_UP`. - Eligible
principal. - Tenure. - Interest band / policy rate. - Repayment
cadence. - Conditions. - Maximum EMI. - Maximum principal. - Top
decision drivers. - Policy version.

Risk band affects haircut and rate band. Capacity remains the binding
limit.

### 9.4 Counteroffer behaviour

If requested amount exceeds maximum principal: - Return a counteroffer
at or below the computed maximum principal. - Explain that the amount is
limited by observed lean-month repayment capacity. - Do not describe the
applicant as dishonest or a bad business. - Keep the lender responsible
for final review.

### 9.5 Stress slider

The stress slider must recompute deterministic capacity and terms using
adjusted lean-period assumptions. It must not retrain either ML model.
The UI must label the result as a scenario simulation.

------------------------------------------------------------------------

# PART B --- AGENTIC AI SPECIFICATION

## 10. Agentic AI design principles

The agent layer coordinates tasks and tools around the ML and
underwriting services. It is not a second, hidden credit decision
engine.

Recommended orchestration: **LangGraph** with a typed shared state and
explicit conditional edges. The existing MERN + Python ML architecture
remains unchanged: - React owner and lender interfaces. - Node / Express
API and MongoDB. - Python FastAPI ML service. - Agent workflow invoked
by the backend as a controlled internal service or module.

### 10.1 What agents may do

-   Read structured application data and provenance.
-   Call approved feature, model, reconciliation, and calculation tools.
-   Identify missing or inconsistent information.
-   Ask for additional evidence.
-   Summarize model and policy outputs.
-   Explain the terms and main drivers.
-   Prepare an audit summary.

### 10.2 What agents may not do

-   Invent or infer missing transaction values.
-   Treat an unverified PDF as a verified rail.
-   Change model probabilities or thresholds.
-   Override hard policy gates.
-   Approve or disburse a loan autonomously.
-   Use gender, religion, caste, or other protected attributes to set
    terms.
-   Make a fraud accusation from a model flag alone.
-   claim that synthetic rails are production integrations.

------------------------------------------------------------------------

## 11. Agent roster and specifications

The MVP should implement a small number of purposeful agents. Some
responsibilities can be combined into one agent node if time is limited.

### Agent 1 --- Underwriting Orchestrator

**Role:** Coordinate the application workflow and control execution
order.

**Inputs:** - Application ID. - Shop profile. - Rails and provenance. -
Cash-flow records. - Requested amount.

**Tools:** - `load_application` - `validate_application` -
`build_features` - `score_authenticity` - `score_stress` -
`run_underwriting_policy` - `write_audit_event`

**Responsibilities:** 1. Load and validate the application. 2. Check
data provenance and verified-rail count. 3. Route zero-verified-rail
applications to `UNVERIFIED`. 4. Invoke the authenticity and financial
analysis steps when allowed. 5. Call the deterministic underwriting
engine. 6. Request explanation and audit summary. 7. Return the
structured result to the lender workflow.

**Output:** Workflow status, decision reference, model references, and
audit reference.

**Guardrail:** The orchestrator controls sequence; it does not choose
the loan amount using free-form LLM reasoning.

### Agent 2 --- Financial Data Analyst

**Role:** Turn raw, authorized or synthetic rails into a normalized
financial picture.

**Tools:** - `parse_aa_payload_demo` - `parse_upi_transactions` -
`parse_gst_summary` - `extract_invoice_fields` -
`reconcile_financial_rails` - `build_financial_features`

**Responsibilities:** - Normalize dates, transaction directions, and
amounts. - Summarize inflows and outflows. - Compare relevant GST, UPI,
and bank totals. - Identify missing periods and incomplete records. -
Generate structured financial features. - Preserve source references and
provenance.

**Output example:**

``` json
{
  "period_days": 90,
  "total_inflow_paise": 0,
  "total_outflow_paise": 0,
  "verified_rail_count": 2,
  "missing_periods": [],
  "reconciliation_flags": [],
  "provenance": "synthetic"
}
```

The zero amounts above are placeholders; the actual tool must populate
them from source records.

**Guardrail:** Use code for arithmetic and reconciliation. The LLM may
summarize the result but must not calculate financial totals from
free-form text.

### Agent 3 --- Authenticity Investigator

**Role:** Interpret Model A and deterministic rail checks, and decide
whether more verification is needed.

**Tools:** - `score_authenticity` - `check_rail_identity` -
`check_transaction_freshness` - `check_payer_concentration` -
`check_gst_upi_gap` - `create_verification_request`

**Responsibilities:** - Read `p_auth` and its model version. - Review
identity mismatch, concentration, roundness, freshness, and cross-rail
gap flags. - Distinguish a model signal from a hard identity failure. -
Recommend `UNVERIFIED`, additional verification, or policy review when
appropriate. - Produce a concise evidence summary.

**Output:** - Authenticity band. - Flags with supporting evidence. -
Missing evidence. - Recommended next action.

**Guardrail:** Do not label an applicant fraudulent solely because of a
high anomaly score. Seasonal, cash-heavy, new, and single-customer
businesses require careful review.

### Agent 4 --- Cash-Flow and Stress Analyst

**Role:** Explain the business's cash-flow behaviour and Model B result.

**Tools:** - `calculate_weekly_cashflow` - `calculate_lean_period` -
`score_stress` - `forecast_cashflow_demo` (optional) -
`get_feature_drivers`

**Responsibilities:** - Summarize typical and weak periods. - Identify
revenue trend and volatility. - Interpret `p_stress`. - Explain the
reference EMI target definition. - Identify the strongest positive and
negative financial drivers.

**Output:** - Cash-flow summary. - Lean-period metrics. - `p_stress` and
risk band. - Evidence-linked drivers.

**Guardrail:** Model B predicts the defined synthetic lean-period stress
proxy, not actual loan default. The agent must preserve that distinction
in every explanation.

### Agent 5 --- Loan Structuring / Terms Agent

**Role:** Present the output of the deterministic underwriting engine in
a lender-usable form.

**Tools:** - `run_underwriting_policy` - `calculate_max_emi` -
`calculate_max_principal` - `generate_counteroffer` -
`simulate_repayment_schedule`

**Responsibilities:** - Request deterministic calculation of maximum EMI
and principal. - Present supported tenure, interest band, and repayment
cadence. - Compare requested amount with maximum affordable principal. -
Present a counteroffer when appropriate. - Explain policy conditions and
step-up eligibility if enabled.

**Output:** Structured terms proposal and calculation references.

**Guardrail:** The agent cannot invent interest rates, change haircuts,
or exceed the deterministic engine's maximum principal. Any change
requires a policy version update or a recorded human override.

### Agent 6 --- Explainability Agent

**Role:** Convert model drivers and policy calculations into concise,
understandable explanations for lenders and owners.

**Inputs:** - Model outputs. - Top feature drivers. - Rail flags and
provenance. - Capacity calculations. - Terms proposal. - Verdict and
policy version.

**Responsibilities:** - Explain why the application is `UNVERIFIED`,
`THIN_FILE`, `STANDARD`, `STEP_UP`, or `DECLINE`. - Explain the maximum
EMI and principal in plain language. - Distinguish verified from
unverified evidence. - Explain what additional information could resolve
uncertainty. - Use non-stigmatising language.

**Example explanation:**

> The application has no credit bureau file. The assessment uses the
> available simulated UPI and GST rails. The proposed amount is limited
> by the business's weakest observed four-week cash-flow period. One
> payer contributes a high share of incoming credits, so the lender
> should review the concentration flag.

**Guardrail:** Every factual statement must map to a structured source
field, model driver, or policy calculation. The agent must not invent a
reason that is absent from the evidence.

### Agent 7 --- Fairness and Audit Agent

This can be implemented as two deterministic tools with one reporting
agent node.

**Fairness responsibilities:** - Generate or load synthetic twin
applications. - Hold all financial and provenance fields constant. -
Change only protected-attribute flags used for fairness testing. -
Re-run the deterministic decision pipeline. - Compare verdict,
principal, rate band, tenure, and cadence. - Report any difference.

**Audit responsibilities:** - Record input payload hash. - Record model
versions and feature schema version. - Record policy version. - Record
predictions and terms. - Record agent workflow version. - Record human
override actor, reason, and changed terms. - Produce a traceable
decision summary.

**Guardrail:** Protected attributes may be retained in a segregated
fairness test fixture, but must not be passed into the production model
feature vector or terms calculation.

------------------------------------------------------------------------

## 12. LangGraph workflow

### 12.1 Shared state

Use a typed state object similar to:

``` python
class UnderwritingState(TypedDict, total=False):
    application_id: str
    shop: dict
    rails: list[dict]
    cashflows: list[dict]
    requested_amount_paise: int

    provenance_summary: dict
    verified_rail_count: int
    features: dict

    p_auth: float
    authenticity_band: str
    authenticity_flags: list[dict]

    p_stress: float
    stress_band: str
    stress_drivers: list[dict]

    capacity: dict
    terms: dict
    verdict: str

    explanation: dict
    fairness_result: dict
    audit_reference: str
    errors: list[dict]
```

### 12.2 Workflow

``` text
START
  |
  v
Load and validate application
  |
  v
Check provenance and verified rails
  |
  +---- verified_rail_count == 0 ----> UNVERIFIED result
  |                                      |
  |                                      v
  |                                 Explain + Audit
  |
  v
Financial data normalization and reconciliation
  |
  v
Deterministic identity / rail hard checks
  |
  +---- hard identity failure -------> Policy decline / review
  |                                      |
  |                                      v
  |                                 Explain + Audit
  |
  v
Model A — Authenticity
  |
  v
Authenticity policy gate / review
  |
  v
Feature builder + Model B — Stress
  |
  v
Lean-month capacity calculation
  |
  v
Versioned terms mapping
  |
  v
Counteroffer / verdict
  |
  v
Explainability
  |
  v
Fairness check (test workflow)
  |
  v
Audit write
  |
  v
END
```

The fairness twin workflow may run as a separate evaluation route rather
than on every live application. The audit write must run for every score
and every human override, including early `UNVERIFIED` outcomes.

### 12.3 Failure handling

-   If a required rail parser fails, return a structured data-quality
    error or `UNVERIFIED`; do not fabricate a replacement value.
-   If a model service is unavailable, fail closed for full underwriting
    and return a retry / manual review state.
-   If model metadata or feature schema version is incompatible, reject
    the scoring request.
-   If the LLM explanation step fails, preserve the deterministic
    decision and return a template-based explanation.
-   If the audit write fails, do not silently report the workflow as
    fully completed; surface an operational error and retry according to
    backend policy.

------------------------------------------------------------------------

## 13. Tool contracts

Tools should be small, typed, testable functions. Example contracts:

  -------------------------------------------------------------------------------
  Tool                            Input                   Output
  ------------------------------- ----------------------- -----------------------
  `load_application`              `application_id`        Shop, rails, cashflows,
                                                          requested amount

  `validate_application`          Application payload     Validation result and
                                                          errors

  `build_features`                Rails + cashflows +     Feature vector + schema
                                  shop metadata           version

  `score_authenticity`            Model A feature vector  `p_auth`, model version

  `score_stress`                  Model B feature vector  `p_stress`, model
                                                          version

  `reconcile_financial_rails`     GST / UPI / AA          Gaps and reconciliation
                                  summaries               flags

  `run_underwriting_policy`       Predictions + capacity  Verdict and terms
                                  inputs + policy version 

  `simulate_repayment_schedule`   Principal, rate,        Repayment schedule
                                  cadence, tenure         

  `run_fairness_twins`            Twin application IDs    Offer deltas

  `write_audit_event`             Event and input hash    Audit reference
  -------------------------------------------------------------------------------

Every tool must validate inputs and return machine-readable errors.
Agents should not call arbitrary shell commands, arbitrary URLs, or
unrestricted database operations.

------------------------------------------------------------------------

# PART C --- API AND DATA CONTRACTS

## 14. FastAPI service

### 14.1 Endpoints

``` text
GET  /health
POST /score
POST /explain        # optional; may return the same driver payload
POST /stress-test    # deterministic scenario recalculation; no model retraining
```

### 14.2 `/score` request

Simplified illustrative contract:

``` json
{
  "application_id": "APP_DEMO_001",
  "shop": {
    "shop_id": "SHOP_DEMO_001",
    "category": "kirana",
    "years_open": 3
  },
  "rails": [
    {
      "type": "upi",
      "trust_class": "verified_simulated",
      "provenance": "synthetic"
    },
    {
      "type": "gst",
      "trust_class": "verified_simulated",
      "provenance": "synthetic"
    }
  ],
  "cashflows": [],
  "requested_amount_paise": 20000000,
  "policy_version": "v1"
}
```

### 14.3 `/score` response

``` json
{
  "application_id": "APP_DEMO_001",
  "data_provenance": "synthetic",
  "verified_rail_count": 2,
  "p_auth": 0.93,
  "p_stress": 0.17,
  "features": {},
  "drivers": [],
  "verdict": "THIN_FILE",
  "principal_paise": 12000000,
  "max_emi_paise": 150000,
  "tenure_months": 10,
  "rate_bps": 1600,
  "cadence": "WEEKLY",
  "conditions": [],
  "policy_version": "v1",
  "model_versions": {
    "auth": "auth-v1",
    "stress": "stress-v1"
  },
  "feature_schema_version": "1.0"
}
```

All values above are examples for the API shape only. The service must
calculate actual outputs from its fixture data and policy; do not
hard-code example values.

### 14.4 `/stress-test` request

``` json
{
  "application_id": "APP_DEMO_001",
  "lean_inflow_delta_pct": -25,
  "lean_outflow_delta_pct": 0,
  "policy_version": "v1"
}
```

Response must include: - Scenario assumptions. - Recomputed lean
surplus. - Recomputed maximum EMI. - Recomputed maximum principal. -
Updated terms. - A `scenario_only: true` marker.

The endpoint must not retrain Model A or Model B. If a scenario changes
model features and the product explicitly intends to re-score stress,
that must be a separate, clearly labelled inference call; the core MVP
slider can remain deterministic.

------------------------------------------------------------------------

## 15. Explainability contract

Use tree feature importance, permutation importance, or SHAP if time
permits. SHAP is optional for the hackathon and should not block
delivery.

Map feature names to clear language:

  -----------------------------------------------------------------------
  Feature                             Example explanation
  ----------------------------------- -----------------------------------
  `lean_month_ratio`                  "The weakest four-week period is
                                      materially below a typical period."

  `max_payer_share`                   "One payer contributes a high share
                                      of incoming credits."

  `gst_upi_rel_gap`                   "The GST summary and UPI evidence
                                      show a material difference."

  `cv_weekly_inflow`                  "Weekly incoming amounts vary
                                      significantly."

  `history_weeks`                     "The available transaction history
                                      is short."
  -----------------------------------------------------------------------

The explanation payload should retain: - Feature name. - Observed
value. - Reference threshold or comparison, where defined. - Direction
of impact. - Source / calculation reference. - Model or policy version.

Do not tell the user that a feature "caused" the decision unless the
underlying policy or model explanation supports that statement. Prefer
"contributed to" or "was a factor in".

------------------------------------------------------------------------

# PART D --- EVALUATION, FAIRNESS, AND SAFETY

## 16. Evaluation plan

### 16.1 Model evaluation

Produce separate reports for Model A and Model B. Include: - Holdout
size and class balance. - Precision, recall, F1, ROC-AUC. - Confusion
matrix. - PR-AUC where class imbalance makes it useful. - Brier score /
calibration for Model B where feasible. - Results by synthetic
archetype. - Error analysis with representative false positives and
false negatives.

### 16.2 Product-level evidence

Compare: 1. **Baseline:** `DECLINE if no CIBIL`. Since the demo cohort
is thin-file, baseline funded count is zero. 2. **Nidhi:** number of
synthetic shops receiving an offer, with proxy stress among offered
shops on the held-out cohort.

Optional second baseline: - Approve if median inflow exceeds a fixed
threshold, ignoring authenticity. - Demonstrate why a high-inflow
mule-like synthetic profile can pass a simplistic threshold but fail
Nidhi's authenticity gate.

Always label these as synthetic cohort results. Do not imply a measured
lift on real Indian MSMEs.

### 16.3 Fairness evaluation

For each twin pair: - Keep financial features, rail evidence, business
history, and requested amount identical. - Change only the
protected-attribute flag in the test fixture. - Run the same versioned
underwriting policy. - Compare verdict, principal, interest band,
tenure, and cadence.

Acceptance target for exact twins: - Principal difference = ₹0. -
Rate-band difference = 0. - No change in verdict, tenure, or cadence.

Any difference must fail the test and be investigated. Do not rely on an
LLM to perform the comparison; use deterministic code.

### 16.4 Failure analysis

Explicitly discuss: - New genuine shops with short transaction
histories. - Cash-heavy businesses with incomplete digital evidence. -
Seasonal businesses whose peaks or troughs may look anomalous. -
Legitimate businesses with one dominant customer. - Incomplete or
delayed GST / bank evidence.

The system should be able to request more evidence instead of forcing a
decline when uncertainty is the main issue.

------------------------------------------------------------------------

## 17. Responsible AI, privacy, and controls

-   Use synthetic data for the hackathon demo.
-   If real data is added later, obtain explicit consent and use
    authorized integrations.
-   Minimize collection and retention of personal data.
-   Keep protected attributes out of model inputs and underwriting
    calculations.
-   Restrict protected-attribute test fixtures to fairness evaluation.
-   Do not use a shop's city or locality as an unexplained proxy for
    creditworthiness.
-   Do not treat cash-heavy activity or short history as proof of fraud.
-   Keep human review for adverse or ambiguous outcomes.
-   Provide clear, non-stigmatising explanations and an avenue to
    correct inaccurate data.
-   Record model, feature, policy, and agent versions for every
    decision.
-   Do not claim RBI approval, production Account Aggregator access,
    zero fraud, or real-world default prediction.

------------------------------------------------------------------------

# PART E --- WOW FEATURES AND DELIVERY PRIORITIES

## 18. MVP features that should be implemented

These are directly aligned with the participant specification and
judging criteria.

  -----------------------------------------------------------------------
  Priority                Feature                 Why it matters
  ----------------------- ----------------------- -----------------------
  P0                      Dual ML models:         Core technical depth
                          authenticity + stress   

  P0                      Verified vs unverified  Prevents PDF-only
                          rail gate               full-limit decisions

  P0                      Lean-month capacity and Answers which / how
                          terms engine            much / on what terms

  P0                      Stress slider           Demonstrates how terms
                                                  respond to a weaker
                                                  lean period

  P0                      Explainable top drivers Makes the result
                                                  understandable to
                                                  lenders

  P0                      Synthetic provenance    Honest and transparent
                          badges                  demo

  P0                      Baseline vs Nidhi       Shows measurable
                          evidence                synthetic-cohort
                                                  comparison

  P0                      Fairness twin test      Demonstrates same terms
                                                  for identical financial
                                                  profiles

  P0                      Audit entry per score   Traceability
                          and override            

  P1                      Agent-based             Makes exception
                          authenticity            handling visible
                          investigation           

  P1                      Automated underwriting  Improves lender
                          report                  workflow

  P1                      Counteroffer            Shows why a smaller
                          explanation             amount is proposed
  -----------------------------------------------------------------------

## 19. Optional advanced / post-hackathon features

These are extensions, not MVP dependencies:

### 19.1 MSME Financial Digital Twin

A simulation layer representing the business's inflows, outflows,
seasonality, and liabilities. It can test scenarios such as a 20--25%
revenue decline or an expense increase and recompute affordability.

### 19.2 Credit Readiness Assistant

Explains what additional verified evidence or operating history could
help the business receive a more complete assessment. It should not
promise future approval.

### 19.3 Early Financial Stress Monitoring

With ongoing consent and new financial data, identify worsening cash
flow and prompt a lender or owner to review affordability. It must not
silently alter existing loan terms.

### 19.4 Alternative Credit Passport

A consent-controlled, shareable summary of verified business cash-flow
evidence and assessment history. Do not expose raw transactions by
default.

### 19.5 Portfolio Intelligence

Aggregate anonymized / appropriately governed portfolio trends across
business categories, risk bands, and repayment patterns.

### 19.6 Multilingual Financial Copilot

Allow an MSME owner to ask questions in Kannada, Hindi, or English about
their cash-flow summary and offer. Answers must be grounded in the
structured assessment.

------------------------------------------------------------------------

## 20. Suggested repository layout

``` text
repo/
  apps/
    web/                       # React owner + lender SPA
    api/                       # Node.js + Express BFF
  ml/
    generate_shops.py
    features.py
    schema.json
    train_auth.py
    train_stress.py
    evaluate.py
    policy.py
    service.py                 # FastAPI
    agent_graph.py             # LangGraph workflow
    agents/
      financial_analyst.py
      authenticity_investigator.py
      cashflow_analyst.py
      terms_presenter.py
      explainability.py
      fairness_audit.py
    tools/
      rail_parsers.py
      reconciliation.py
      capacity.py
      terms.py
      audit.py
      fairness.py
    models/
      auth.joblib
      stress.joblib
      meta.json
    reports/
      metrics.json
      model_card_auth.md
      model_card_stress.md
  data/
    seed/
      shops.json
      rails.json
      cashflows.json
    generated/
  docs/
    ml-agentic-ai-spec.md
```

This is a logical target layout. If the existing repository already has
a structure, adapt the filenames rather than duplicating services.

------------------------------------------------------------------------

## 21. Implementation sequence

### Phase 1 --- Data and ML foundations

1.  Implement synthetic generator and archetypes.
2.  Create shop-level labels.
3.  Implement feature builder and schema.
4.  Add feature unit tests.
5.  Train Model A and Model B.
6.  Evaluate on a shop-level holdout.
7.  Save model artifacts and metadata.

**Exit criteria:** Both models load from disk and return stable,
versioned predictions for fixed fixtures.

### Phase 2 --- Underwriting and API

1.  Implement verified-rail hard gates.
2.  Implement lean-month surplus.
3.  Implement versioned haircut and terms mapping.
4.  Implement maximum EMI and principal calculations.
5.  Expose `/health`, `/score`, and `/stress-test`.
6.  Add model and policy version metadata.

**Exit criteria:** A clean synthetic kirana receives numeric terms; a
PDF-only shop cannot receive a standard full limit; stress slider
recalculates terms without retraining.

### Phase 3 --- Agentic workflow

1.  Define typed LangGraph state.
2.  Implement application validation and provenance nodes.
3.  Add financial analysis and reconciliation tools.
4.  Add Model A and Model B tool calls.
5.  Add deterministic underwriting node.
6.  Add explanation node with grounded inputs.
7.  Add audit writes and failure handling.

**Exit criteria:** The workflow can complete a clean application and an
unverified / suspicious application with traceable, structured outputs.

### Phase 4 --- WOW and evidence

1.  Add fairness twin runner.
2.  Add baseline comparison.
3.  Add lender-facing explanation report.
4.  Add stress scenario visualization.
5.  Add optional financial digital twin if the core workflow is stable.

**Exit criteria:** Demo shows clean kirana, PDF-only, mule-like, GST
mismatch, volatile genuine shop, stress slider, fairness twins, and
baseline evidence.

------------------------------------------------------------------------

## 22. Acceptance criteria

### ML

-   [ ] Model A predicts `p_auth` from the documented authenticity
    features.
-   [ ] Model B predicts `p_stress` from the documented historical
    financial features.
-   [ ] Targets are generated from synthetic labels and future synthetic
    periods as specified.
-   [ ] Train / validation / test split is by `shop_id`.
-   [ ] No target leakage or protected attributes in model features.
-   [ ] Metrics and confusion matrices are saved.
-   [ ] Model versions and feature schema versions are returned at
    inference.
-   [ ] Failure analysis includes new, cash-heavy, and seasonal
    businesses.

### Underwriting

-   [ ] Zero verified rails returns `UNVERIFIED` or the configured
    no-full-limit outcome.
-   [ ] PDF-only applications cannot receive a `STANDARD` full limit.
-   [ ] Lean-month capacity is deterministic and reproducible.
-   [ ] Requested amount above capacity generates a counteroffer where
    policy permits.
-   [ ] Terms are produced from a versioned policy.
-   [ ] Stress slider recalculates scenario terms without retraining.

### Agents

-   [ ] Agents use explicit, typed tools.
-   [ ] Agents cannot change model outputs or policy thresholds.
-   [ ] Explanations are grounded in structured evidence.
-   [ ] Suspicious signals trigger review / verification, not
    unsupported accusations.
-   [ ] Model / policy failures are surfaced safely.
-   [ ] Audit event is written for every score and human override.

### Fairness and demo

-   [ ] Twin profiles with identical financial data receive identical
    terms.
-   [ ] Protected attributes are excluded from model and underwriting
    features.
-   [ ] All demo financial rails and cashflows are labelled synthetic /
    simulated.
-   [ ] Baseline comparison is visible and labelled synthetic.
-   [ ] No claim is made that the prototype is RBI-approved or validated
    on live MSME outcomes.

------------------------------------------------------------------------

## 23. Product thesis to preserve

> **We don't approve people. We price verified lean-month surplus, and
> we don't let PDFs print a limit.**

The ML models estimate authenticity and financial stress. The
deterministic engine computes repayment capacity and terms. Agents
coordinate the evidence and explain the outcome. The lender remains
accountable for the final credit decision.

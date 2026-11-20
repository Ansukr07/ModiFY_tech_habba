# Nidhi — ML & Agentic AI Technical Specification

**Project:** F2 — Credit for the Credit-Invisible  
**Product:** Nidhi / Invisible Underwriting Desk  
**Document type:** ML and Agentic AI implementation specification  
**Version:** 1.1  
**Status:** Working implementation spec. Model B is trained first; Model A follows.  
**Date:** 2026-11-20  
**Supersedes for ML implementation:** `nidhi_ml_agentic_ai_spec2.md` (v1.0)  
**Sources:**

- `nidhi_ml_agentic_ai_spec2.md` — product thesis, underwriting policy, agents, API, evaluation, and delivery plan.
- `Nidhi ML Handoff (Model B first, then Model A).pdf` — locked data, label, feature, and training decisions from the 2026-11-20 handoff. Where the two differ, this document follows the handoff.

The participant specification `F2 — Credit for the credit-invisible` remains the product source of truth. This document does not change the product thesis or the agreed MERN + Python ML architecture.

------------------------------------------------------------------------

## 0. What changed in v1.1

| Topic | v1.0 | v1.1 (locked) |
| --- | --- | --- |
| Training order | Models A and B in parallel | **Model B first** (Berka), then Model A |
| Training data | Synthetic shop generator is the primary dataset | **Existing public data.** Synthetic data only as a last resort for pieces with no public source (GST, PDF-only), and those rows are labelled `synthetic` |
| Model B data | Future synthetic lean period | **Berka / PKDD'99** cash-flow dynamics. Loan status is a sanity check only |
| Model B label | Generator flag that the next lean period misses a reference EMI | Future-window coverage of `EMI_ref = 0.35 × M`, where `M` is the account's own monthly-equivalent inflow. **`r = 0.35` is fixed.** Report the train-split positive rate; if it falls outside roughly 15–40%, flag it and decide jointly. Do not retune `r` silently |
| Model B features | Raw size features (`median_monthly_inflow`, `unique_payers`, `invoice_count`, …) | **Scale-free weekly features.** Two variants: **B-inflow** and **B-full** |
| Model A data | Synthetic `authentic_ops` / mule / PDF-fraud labels | **Open.** IBM AML is the only labelled public option and is synthetic. Alternative: a rule-based authenticity score until real labels exist |
| Environment | Scripts under `ml/` | **Jupyter**, scikit-learn only, artifacts saved with joblib or pickle |
| Split unit | `shop_id` | **Account id** (Berka `account_id`; production `shop_id`). Never split by transaction row. 70 / 15 / 15, seed 42 |
| Domain | One feature set for all rails | **UPI vs bank-statement domain shift** is a first-class constraint. Metrics are cash-flow dynamics on real bank data, not MSME or UPI outcomes |

Open items that are **not** locked are listed in section 24. They must stay visible in the model card.

------------------------------------------------------------------------

## 1. Purpose and scope

Nidhi is an underwriting desk for thin-file MSMEs. It uses consented or public financial rails and operational cash-flow evidence to help a lender decide:

1. **Which** businesses may receive an offer, should be declined, or need more data.
2. **How much** principal a business can reasonably support.
3. **On what terms** the loan may be structured.

The system must distinguish three different responsibilities:

- **Machine learning:** estimate data authenticity risk and the probability of financial stress in a future lean period.
- **Deterministic underwriting:** calculate affordable repayment capacity and map it to loan terms using versioned rules.
- **Agentic AI:** coordinate analysis tools, investigate exceptions, summarize evidence, and explain the result to the owner or lender.

An LLM must not independently approve a loan, invent financial figures, change model predictions, or override underwriting policy.

### 1.1 In scope for the hackathon MVP

- Two supervised ML models, built in this order:
  - **Model B — Stress / thin-file risk**, trained first on Berka.
  - **Model A — Authenticity**, trained after B, or a documented rule-based fallback if labelled authenticity data is rejected.
- Canonical cash-flow schema and a shared Python feature builder used by training and inference.
- Two Model B variants: **B-inflow** (UPI-only) and **B-full** (UPI plus bank / AA statement).
- Offline training and evaluation in Jupyter (scikit-learn only).
- FastAPI scoring service that loads saved artifacts and does not retrain.
- Deterministic lean-month capacity and terms engine.
- A controlled agent workflow for financial analysis, exception investigation, explanation, and audit support.
- Evidence dashboard comparing the product with the `no CIBIL → decline` baseline.
- Fairness twin checks.
- Explicit `real` / `simulated` / `synthetic` provenance labels.
- Loan-status sanity check of Model B on the 682 Berka loan accounts.

### 1.2 Out of scope for the hackathon MVP

- Production Account Aggregator connectivity or real bank login.
- Live GST portal integration.
- Aadhaar, CKYC, or real identity verification.
- Real loan disbursal, NACH, collections, or legal agreements.
- A claim that the models predict real-world MSME default rates, UPI outcomes, or Indian shop outcomes.
- An LLM making the final credit decision.
- Automated fraud accusations based solely on an anomaly score.
- Neural-network or computer-vision claims about detecting every forged PDF.
- A synthetic shop generator as the primary training set.

GST summaries and PDF-only payloads that have no public source may be small labelled-synthetic fixtures for the demo rails. The interface and pitch must say so on every such screen.

------------------------------------------------------------------------

## 2. System design principles

1. **Authenticity is separate from credit risk.** A business can have healthy cash flow but untrustworthy or insufficient evidence; it can also have authentic data but weak repayment capacity.
2. **A bureau score is not required.** The prototype does not use CIBIL or another bureau score as an input to its verdict.
3. **A PDF is not a verified financial rail.** Self-uploaded PDFs, photos, spreadsheets, and typed totals are unverified and must not set a full credit limit.
4. **Capacity comes from transparent calculations.** The maximum EMI and principal are computed deterministically and shown to the lender.
5. **Risk changes terms; it does not replace capacity math.** `p_stress` contributes to a policy-controlled haircut and rate band. It never approves or declines alone.
6. **Agents call tools; they do not fabricate facts.** All numeric values come from structured data, feature functions, model responses, or deterministic calculations.
7. **Every result is traceable.** Persist model versions, policy version, provenance, input hash, decision output, and human overrides.
8. **Fairness is tested, not asserted.** Synthetic or fixture twin profiles with the same operational financial data should receive the same offer when protected attributes are changed.
9. **Uncertainty is an acceptable outcome.** The system may return `UNVERIFIED` or request more information rather than forcing a score or approval.
10. **Proxy metrics are not real-world validation.** Berka results are labelled as cash-flow dynamics on real anonymized Czech bank data (1993–98, CZK). They are not MSME or UPI outcomes.
11. **Features are scale-free.** Ratios, coefficients of variation, and relative slopes transfer across rails. Raw currency size does not.
12. **Missing is missing.** A missing outflow, GST figure, or undefined feature is a missing value plus a flag. It is never silently zero-filled. Weeks inside an account's observed life may be zero-filled for the weekly inflow series; that is a different rule and applies only inside the account's life.
13. **`r = 0.35` is fixed** for the reference EMI. The positive rate is reported. It is not a knob for silent retuning.

**Thesis:** We don't approve people. We price verified lean-month surplus, and we don't let PDFs print a limit.

------------------------------------------------------------------------

# PART A — MACHINE LEARNING SPECIFICATION

## 3. ML overview

| Component | Task | Target | Output | Role in underwriting |
| --- | --- | --- | --- | --- |
| Model B — Stress | Binary classification | `y_stress` | `p_stress` | Estimates whether the next 4-week window fails to cover a reference EMI equal to 35% of the account's own monthly-equivalent inflow |
| Model A — Authenticity | Binary classification | `y_auth` | `p_auth` | Estimates whether operational records resemble authentic activity rather than a suspicious pattern. Data choice is still open (section 8.6) |
| Feature builder | Deterministic transformation | None | Structured feature vector | Same features in training and inference, after weekly aggregation |
| Evaluation pipeline | Offline evaluation | Known labels on the chosen dataset | Metrics, model card, sanity check | Measures behaviour on a held-out set of accounts |

**Build order:** Model B, then Model A. Model A reuses the same weekly aggregation and canonical cash-flow code.

The two models are trained and evaluated independently.

- **Sequential version (initial):** Model B does not consume `p_auth`. Authenticity is a separate gate and haircut.
- **Stacked version (later experiment only):** Model B may consume Model A's **out-of-fold** `p_auth`. In-sample predictions from Model A must not be used as training features.

### 3.1 What is not ML

These stay deterministic and versioned:

- Hard gates. Zero verified rails → `UNVERIFIED`. PDF-only can never be `STANDARD`.
- Lean-month capacity.
- Terms mapping (verdict, principal, tenure, rate band, cadence, conditions).

LLM agents never approve loans, change probabilities, thresholds, or haircuts, invent figures, or use protected attributes.

------------------------------------------------------------------------

## 4. Data

### 4.1 Data policy

Use existing public datasets. Do not build a synthetic shop corpus as the training set.

Synthetic data is allowed only as a last resort for a piece that has no public source (GST reconciliation fixtures, PDF-only applications). Every such record carries `"provenance": "synthetic"` and a generator version. Never mix real and synthetic rows without that field.

If no real UPI-shaped data can be obtained, a small UPI payer-behaviour simulator is a labelled-synthetic fallback. The preference is to avoid it.

### 4.2 Datasets

| Dataset | Link | Nature | Contents | Use |
| --- | --- | --- | --- | --- |
| Berka / PKDD'99 | https://sorry.vse.cz/~berka/challenge/pkdd1999/berka.htm | Real, anonymized, 1993–98, amounts in CZK | `account` (4,500), `disp`, `client`, `district`, `loan` (682: 606 good / 76 bad), `card`, `order`, `trans` | **Model B training.** Loan status is a sanity check only |
| IBM Transactions for AML | https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml and https://github.com/IBM/AML-Data | Synthetic multi-agent simulation | Sender/receiver account, amounts, currency, payment format, `Is Laundering`. HI-Small is about 5.08M transactions and 5,177 laundering labels (0.10%). One repo README claims about 5% for HI — **verify in Jupyter** | Only labelled public option for Model A. Decision is open (section 8.6) |
| Kaggle UPI Data 2023 | https://baselight.app/u/kaggle/dataset/nitishjolly_upi_data | Single-account statement, about 25 KB | Date, Category, RefNo, Withdrawal, Deposit, Balance | Parser and feature smoke test only. Not a validation set |
| NPCI UPI statistics | https://dataful.in/datasets/21563/ and https://www.npci.org.in/what-we-do/upi/upi-ecosystem-statistics | Real aggregate | Monthly/state UPI volume and value, P2P vs P2M | Seasonality and context only. No labels and no per-account rows |

**Do not use as features or labels:** client gender, birth date (protected), district demographics (locality proxy), loan amount as a stress predictor, CIBIL, archetype or generator flags.

### 4.3 Berka column notes

Verify these in Jupyter against the dataset docs. Files are semicolon-separated `.asc`.

**`trans`:** `trans_id`, `account_id`, `date` (YYMMDD integer), `type` (`PRIJEM` credit, `VYDAJ` withdrawal, `VYBER` cash withdrawal), `operation` (`VKLAD` cash credit, `PREVOD Z UCTU` incoming transfer, `VYBER` cash withdrawal, `PREVOD NA UCET` outgoing transfer, `VYBER KARTOU` card withdrawal), `amount`, `balance`, `k_symbol` (`UROK` interest, `SIPO` household, `DUCHOD` pension, `UVER` loan payment, others), `bank` and `account` (partner; empty for cash).

**`loan`:** `loan_id`, `account_id`, `date`, `amount`, `duration`, `payments`, `status` (`A` finished OK, `B` finished unpaid, `C` running OK, `D` running in debt). **Bad = B or D.**

**Digital inflow for Model B:** credits with `operation = PREVOD Z UCTU`. Exclude cash deposits (`VKLAD`), pension credits (`k_symbol = DUCHOD`), and interest (`UROK`). Verify the codes. Handle blank `operation` explicitly; do not treat a blank as a digital transfer.

### 4.4 IBM AML column notes

Verify in Jupyter. Expected columns: Timestamp, From Bank, Account (sender), To Bank, Account (receiver), Amount Received, Receiving Currency, Amount Paid, Payment Currency, Payment Format, `Is Laundering`.

The series spans only a few weeks (verify). Weekly history features are weak there; use daily granularity for Model A on IBM. Do not use graph position or laundering-ring membership as features. Transaction-level labels must be aggregated to accounts.

### 4.5 Business-like account filter (Berka, Model B)

Defaults, to be tuned and recorded:

- At least **52 weeks** of history.
- At least **26 weeks** with digital inflow.
- At least **5** distinct counterparties.

### 4.6 Domain shift: UPI streams vs bank statements

Target users are MSMEs with UPI streams, not personal bank statements. Berka is personal-bank style (few large entries, cash operations). A kirana is hundreds of small UPI credits a day. Both are money-in events, so the model uses **weekly inflow dynamics**, not raw rows.

1. Convert every rail to the canonical cash-flow schema (section 5), then aggregate to a weekly series before features.
2. Ship two Model B variants:
   - **B-inflow:** UPI-only path. Inflow features only. Missing outflow stays missing. The UPI-only path gets a higher haircut, and the lender sees **inflow-only estimate**.
   - **B-full:** UPI plus bank / AA statement. Adds outflow features.
3. Scale-free features only (ratios, CV, relative slope). Raw size is not a predictor.
4. Apply the Berka digital-inflow filter in section 4.3.
5. Apply the business-like filter in section 4.5.
6. Validate on 10–20 real consented UPI statements if they can be obtained. The Kaggle UPI file is for parser testing only.
7. Report Berka-trained metrics as **cash-flow dynamics on real bank data**.
8. A labelled-synthetic UPI simulator is the fallback only if no real UPI-shaped data exists.

| Feature | Transfers to UPI scoring? | Reason |
| --- | --- | --- |
| `p10_rel`, `cv_weekly_inflow`, `slope_rel`, `lean_month_ratio`, `active_week_ratio` | Yes | Weekly dynamics are rail-agnostic and scale-free |
| Median monthly inflow (raw) | Only after it is used to form ratios or the reference EMI | Scale differs by orders of magnitude |
| `unique_payers` | No as a transferred UPI feature | UPI shops have hundreds of payers; Berka accounts have a handful. Kept only as an experimental B-full feature |
| `outflow_ratio`, `residual_after_opex` | No on the UPI-only path | A merchant VPA shows collections, not expenses |
| `invoice_count` | No | No invoice data in the training sources |

### 4.7 Demo archetypes that are no longer training labels

The v1.0 generator archetypes (`stable`, `seasonal`, `declining`, `mule`, `pdf_only`, `gst_mismatch`, `twin_fairness`) are **not** Model B training labels.

Keep them as:

- **Failure-analysis slices on Berka**, where a real analogue exists: account-size tercile, history length, high-CV (seasonal-like), low digital-share (cash-heavy).
- **Policy and demo fixtures**, labelled with provenance, for PDF-only, GST mismatch, and fairness twins.
- **Hard cases the product must still handle:** a new genuine business with short history, a cash-heavy kirana, a festival-driven seasonal business, one large legitimate customer, a temporary spike. Unusual is not fraudulent by construction.

------------------------------------------------------------------------

## 5. Canonical cash-flow schema

One row per transaction. Training and inference both start here.

| Field | Meaning |
| --- | --- |
| `txn_id` | Transaction id |
| `account_id` | Berka account id in training; `shop_id` in production |
| `ts` | Timestamp. Berka `date` YYMMDD is parsed into `ts` |
| `inflow` | Incoming amount on this row, else 0 |
| `outflow` | Outgoing amount on this row, else 0 |
| `counterparty_id` | Payer VPA or partner account. Null for cash |
| `channel` | `digital` or `cash` |
| `source_rail` | `upi` \| `aa` \| `gst` \| `bank` \| `pdf` |
| `provenance` | `real` \| `simulated` \| `synthetic` |

Berka `type` and `operation` decide inflow vs outflow and channel. Partner account becomes `counterparty_id`.

**Money units:** production API and database contracts use integer paise. Berka stays in CZK because Model B features are scale-free. Do not convert CZK to INR for training.

Suggested logical objects that still sit beside the cash-flow table:

**Shop** — `shop_id`, `business_category`, `city` (display and audit only; not a model input and not an unexplained creditworthiness proxy), `years_open`, `udyam_present` (identity support only), `merchant_vpa` (synthetic or consented in demo), `gstin_reference` (same), `owner_flags` (fairness fixtures only; never a model input), `provenance`.

**Rail** — `rail_id`, `shop_id`, `rail_type` (`aa` \| `upi` \| `gst` \| `udyam` \| `pdf` \| `bank`), `trust_class` (`verified_simulated` \| `verified` \| `supporting` \| `unverified`), `identity_match`, `source_timestamp`, `payload_reference`, `provenance`.

------------------------------------------------------------------------

## 6. Shared feature engineering

Python owns feature-building logic. The Node / Express API must not recompute the same financial features.

Create `ml/features.py` and document the input/output contract in `ml/schema.json`. The Jupyter notebook and the FastAPI service import the same functions.

### 6.1 Window definitions (Model B and shared weekly series)

- **Cutoff `T`.** Features use weeks up to and including `T`. Labels use weeks after `T`.
- **Observation window:** the **26 weeks** ending at `T`. Minimum acceptable window: **13 weeks**.
- **Weeks are Monday-start.**
- `W_i` = digital inflow in week `i`. Weeks **inside the account's life** with no digital inflow are zero. Weeks outside the account's life are not invented.
- Rolling 4-week sums: `S_j = W_j + W_{j+1} + W_{j+2} + W_{j+3}`.
- **Monthly-equivalent inflow `M`** = median of the non-overlapping 4-week block sums. `M` sets the reference EMI. `M` is excluded as a raw predictor. An optional `log1p(M)` experiment may be reported separately and is not the default model.

### 6.2 Model B features

| Feature | Formula | Purpose | Variant |
| --- | --- | --- | --- |
| `p10_rel` | `percentile_10(W) / median(W)` | How weak the bad weeks are, scale-free | B-inflow and B-full |
| `cv_weekly_inflow` | `std(W, ddof=1) / mean(W)`. If mean is 0, set NaN plus a missing flag | Volatility | B-inflow and B-full |
| `slope_rel` | OLS slope `b` over the last 13 weeks: `b = Σ((t − t̄)(W_t − W̄)) / Σ((t − t̄)²)`, then divide `b` by the mean of those 13 weeks | Trend | B-inflow and B-full |
| `lean_month_ratio` | `min_j(S_j) / median_j(S_j)` | Depth of the lean period; core stress signal | B-inflow and B-full |
| `active_week_ratio` | (weeks with `W > 0`) / (number of weeks in the window). Replaces `weeks_on_vpa` | Track record | B-inflow and B-full |
| `outflow_ratio` | total outflow / total inflow in the window, clipped to `[0, 5]` | Margin pressure | **B-full only** |
| `unique_payers` | `log1p(distinct counterparties among credits)` | Customer diversity. Experimental. Does not transfer cleanly to UPI | **B-full only** |
| `M` | median of non-overlapping 4-week block sums | Sets `EMI_ref`. Not a default predictor | Excluded |

**Predictor sets**

- **B-inflow** = `p10_rel`, `cv_weekly_inflow`, `slope_rel`, `lean_month_ratio`, `active_week_ratio`.
- **B-full** = B-inflow plus `outflow_ratio` and `log1p(unique_payers)`.

**Dropped from training**

- `residual_after_opex` — no expense split in the training data. Compute it in the capacity engine when a bank-statement rail exists.
- `invoice_count` — no source in training data.
- `p_auth` — only in a later stacked experiment, and only out-of-fold.
- Requested loan amount — affordability belongs to the capacity engine.
- Raw `median_monthly_inflow` as a predictor.

**Missing values:** median imputation fit on the training split only, plus missing-indicator columns where a feature can be undefined (`cv_weekly_inflow`). Never zero-fill a missing feature.

### 6.3 Model A features

Computed per account over the credit stream in the observation window.

| Feature | Formula | Purpose | Available in training data? |
| --- | --- | --- | --- |
| `payer_hhi` | `Σ_p s_p²`, where `s_p` = payer credits / total credits. Cash and unknown credits form one bucket | Payer concentration | Berka and IBM |
| `max_payer_share` | `max_p s_p` | One dominant payer. Not proof of fraud | Berka and IBM |
| `round_amount_ratio` | Credits whose amount is divisible by a documented round unit (for example 100 / 500 / 1000 in local currency) / all credits | Manufactured-looking amounts | Berka and IBM |
| `history_weeks` | Number of weeks with transactions | Short history means uncertainty, not fraud | Berka and IBM (IBM timespan is short; verify) |
| `empty_then_spike` | 1 if a run of at least 8 zero-inflow weeks is followed by a week above `median(active weeks) + 5 × MAD`, else 0. Thresholds are proposed and must be tuned | Accounts activated to look active | Berka and IBM, with the IBM short-timespan caveat |
| `gst_upi_rel_gap` | `abs(GST sales − UPI/bank credits) / max(GST sales, UPI/bank credits, eps)`. Missing → NaN plus a flag | Cross-rail mismatch | **Not a model input.** Deterministic reconciliation tool |
| `rail_count_verified` | Count of verified rails. PDF does not count | Evidence trust | **Not a model input.** Hard gate from rail metadata |

Additional deterministic policy signals, not Model A inputs: VPA / GSTIN / shop identity mismatch, source-timestamp freshness, duplicate or replayed records, claimed cash share that needs supporting evidence.

A large cash claim is a verification and haircut issue. It is not a standalone model feature and does not make a cash-heavy business automatically suspicious.

### 6.4 Features that cannot be derived

| Feature | Handling |
| --- | --- |
| `rail_count_verified` | Hard gate in `validate_application`. Stored as `verified_rail_count` in workflow state |
| `gst_upi_rel_gap` | `reconcile_financial_rails`. The flag drives review, haircut, or a more-data request. Not a model input |
| `invoice_count` | `extract_invoice_fields`, counted in code. Trust class `unverified`. Supports conditions or a haircut only |
| `residual_after_opex` | Capacity engine, and only when a bank-statement rail exists. Otherwise missing |
| `weeks_on_vpa` | Replaced by `active_week_ratio` |

General order for any unobtainable feature:

1. Move it to policy if it is a rule.
2. Simulate just that piece and label it `synthetic`.
3. Drop it if an ablation shows negligible ROC-AUC and PR-AUC change.
4. Keep it in the schema with a missing indicator and pass the real value at inference.

Never zero-fill a missing feature.

### 6.5 Feature quality requirements

- Define units and time windows for every feature.
- Use the same missing-value behaviour in training and inference.
- Reject malformed values and impossible date ranges.
- Record feature schema version.
- Add unit tests for each feature, including the Monday-week aggregation, the OLS slope, `lean_month_ratio`, and the `r = 0.35` EMI.
- Keep raw source facts separate from derived features.
- Exclude protected attributes (gender, religion, caste, birth date) and locality / district from both feature vectors.
- Fit imputers and scalers on the training split only.

------------------------------------------------------------------------

## 7. Model B — Stress / thin-file risk (build first)

### 7.1 Objective

Estimate the probability that the account cannot cover a reference EMI over the next four weeks.

This is a **proxy financial-stress target**, not a real-world loan-default label, and not an MSME outcome.

### 7.2 Label

For each account, place a cutoff every **4 weeks**, starting once **26 weeks** of history exist, and only where **4 future weeks** exist.

At cutoff `T`:

```text
M          = monthly-equivalent inflow from the 26-week history window
EMI_ref    = 0.35 × M
Net_future = (sum of digital inflow) − (sum of outflow) over weeks T+1 .. T+4
y_stress   = 1  if Net_future < EMI_ref
           = 0  otherwise
```

Rules:

- Features use weeks up to `T` only. The label uses weeks after `T` only.
- All cutoffs of one account stay in one split.
- Weight each row by `1 / (number of rows for that account)` so long accounts do not dominate.
- **`r = 0.35` is fixed** (an earlier proposal of 0.25 is retired). On the train split, print the positive rate before any model is fit. If the rate falls outside roughly **15–40%**, stop and decide jointly. Do not silently change `r`.

**Proposed variants, not yet confirmed.** Compute the positive rate for each and choose only after looking:

- (a) Inflow-only label (`future inflow < EMI_ref`) if outflow is unreliable, or to match UPI-only scoring.
- (b) Worst rolling 4-week net inside the next 12 weeks, closer to a "lean period" wording.

Until one of those is explicitly chosen, the default label is the next-4-week **net** comparison above. Record `label_variant` in `meta.json`. Rename `target_definition` so it matches the real-data label, for example `next_4w_net_vs_0.35_own_monthly_inflow`. Do not keep the v1.0 string `next_synthetic_lean_period_reference_emi_coverage` once training is on Berka.

### 7.3 Algorithms and tuning

scikit-learn only.

1. **Baseline — `LogisticRegression`:** imputer, `StandardScaler`, `class_weight="balanced"`, `max_iter=1000`.
2. **Primary — `HistGradientBoostingClassifier`:** `learning_rate` about 0.05, `max_depth` 3–5, `max_iter` 200–400, L2 regularization, early stopping, `class_weight="balanced"`, `random_state=42`.
3. **Optional — `RandomForestClassifier`** if time permits. XGBoost is out; the stack stays scikit-learn.

**Tuning:** `GroupKFold` (5 folds) by account on the train split. Select on **PR-AUC and ROC-AUC**.

**Split:** by account id, 70% train / 15% validation / 15% test, seed **42**.

**Calibration:** sigmoid or isotonic, fit on the validation split. Report Brier score and a reliability plot. The served `p_stress` is the calibrated probability.

**Risk bands** (illustrative; tune on validation; store in `meta.json`, do not hard-code in services):

```json
{
  "stress_thresholds": {
    "low_max": 0.20,
    "medium_max": 0.45
  }
}
```

`LOW` at or below `low_max`, `MEDIUM` at or below `medium_max`, `HIGH` above that.

### 7.4 Evaluation

Report, and compare with a majority-class baseline:

- ROC-AUC, PR-AUC, precision, recall, and F1 at the chosen threshold.
- Confusion matrix.
- Brier score and a reliability plot.
- Proxy stress rate among `LOW` and `MEDIUM` (the population that can receive an offer).
- Breakdowns by account-size tercile, history length, high-CV (seasonal-like) accounts, and low digital-share (cash-heavy) accounts.
- Both B-inflow and B-full, so the UPI-only path has its own card.

Do not optimize accuracy alone. A majority-class model can look accurate and still miss stressed accounts.

**Loan-status sanity check (not the training label):**

- For the 682 loan accounts, set `T` = loan date.
- Compute features from weeks before `T`.
- Score with the trained model.
- ROC-AUC of `p_stress` against bad status (`B` or `D` = 1).
- Bootstrap confidence interval. There are only 76 positives.
- An AUC near 0.5 means the proxy label does not capture real loan stress. Report that result either way. Do not refit the model on loan status.

### 7.5 Output contract

```json
{
  "model": "stress",
  "model_variant": "B-inflow",
  "model_version": "stress-v1",
  "p_stress": 0.17,
  "risk_band": "LOW",
  "reference_emi": 0,
  "reference_emi_ratio": 0.35,
  "target_definition": "next_4w_net_vs_0.35_own_monthly_inflow",
  "inflow_only_estimate": true,
  "drivers": [],
  "feature_schema_version": "1.0"
}
```

`reference_emi` is `0.35 × M` for that shop, in the shop's money unit (paise in production). `p_stress` is a calibrated estimate of the proxy target. It is not the probability of defaulting on a real loan. `risk_band` comes from the versioned thresholds.

High stress may lead to a higher haircut, shorter tenure, further review, or decline under policy. It does not replace capacity math.

### 7.6 Training artifacts

- `models/stress.joblib` (joblib or pickle).
- `models/meta.json`.
- `reports/metrics.json`.
- `reports/model_card_stress.md` covering data, label definition, `r`, domain-shift limits, positive rate, sanity-check AUC, and failure analysis.

The runtime loads these files. It does not retrain on a user request or on a stress-slider move.

### 7.7 Explainability

Permutation importance and HistGradientBoosting importances. SHAP is optional and must not block delivery.

Each driver keeps: feature name, observed value, reference or comparison where defined, direction, model version. Wording is **"contributed to"** or **"was a factor in"**. Do not say a feature "caused" the decision.

| Feature | Plain language |
| --- | --- |
| `lean_month_ratio` | "The weakest four-week period is well below a typical period." |
| `cv_weekly_inflow` | "Weekly inflow varies a lot." |
| `slope_rel` | "Inflow is trending down" or "trending up", matching the sign. |
| `p10_rel` | "The weak weeks are very weak relative to a typical week." |
| `active_week_ratio` | "Activity is short or patchy." |
| `outflow_ratio` | "Outflows are large relative to inflows over the window." (B-full only) |

------------------------------------------------------------------------

## 8. Model A — Authenticity (build after Model B)

### 8.1 Objective

Estimate whether the submitted operational records are consistent with ordinary account activity rather than a suspicious pattern.

The target is a dataset label (or, if the open decision goes the other way, a documented rule score). It is not ground-truth proof that real-world Indian MSME records are genuine.

### 8.2 Label, if IBM AML is used

IBM AML is the only labelled public option.

```text
y_auth = 0  if the account appears in at least one Is Laundering transaction
y_auth = 1  otherwise
```

The positive suspicious class is `y_auth = 0`. The label is extremely imbalanced. Aggregate transaction labels to accounts before the split. Do not use graph-position or laundering-ring features.

### 8.3 Algorithms

1. `LogisticRegression` with scaling — interpretable baseline.
2. `HistGradientBoostingClassifier` — primary candidate.
3. Optional `RandomForestClassifier`.

Imputation is fit on the training split only. Use class weights. Record package versions. Fixed seed 42.

**Split:** by account, **stratified by label**, 70 / 15 / 15, seed 42.

IBM's short timespan makes `history_weeks` and `empty_then_spike` weak. State that limit in the model card. Prefer daily aggregation on IBM when weekly history is too short to be meaningful, and document which granularity was used.

### 8.4 Output contract

```json
{
  "model": "authenticity",
  "model_version": "auth-v1",
  "p_auth": 0.93,
  "authenticity_band": "HIGH",
  "flags": [],
  "feature_schema_version": "1.0"
}
```

Bands use versioned thresholds. Placeholders until tuned:

```json
{
  "auth_thresholds": {
    "low_below": 0.40,
    "high_at_or_above": 0.75
  }
}
```

`LOW` below 0.40, `HIGH` at or above 0.75, `MEDIUM` in between. The middle band triggers a haircut, extra verification, or `UNVERIFIED` according to policy.

`p_auth` is an estimate, not a guarantee. Hard identity failures and zero verified rails are policy gates. They are not folded into the probability.

### 8.5 Evaluation

- Precision and recall on the suspicious class (`y_auth = 0`).
- F1, ROC-AUC, PR-AUC (required because of imbalance).
- Confusion matrix.
- False-positive review for new, cash-heavy, and seasonal-like accounts.
- Show recall and false positives together. False positives exclude genuine MSMEs.

Training outputs: `models/auth.joblib`, shared `models/meta.json`, `reports/metrics.json`, `reports/model_card_auth.md`.

### 8.6 Open decision (do not silently pick)

IBM AML is synthetic, not Indian MSME data, and the series is short. Model A would learn the generator's patterns.

Choose explicitly, and write the choice into the model card:

1. **Train on IBM AML** despite the preference for non-synthetic data, with the caveats above on every screen that shows `p_auth`, or
2. **Ship a rule-based authenticity score** (payer HHI, max payer share, round-amount ratio, empty-then-spike, freshness) until real labels exist. The score is still not a fraud accusation, and the same policy gates still apply.

Hard identity failures and zero verified rails remain policy gates in either choice.

------------------------------------------------------------------------

## 9. Training, validation, and reproducibility

### 9.1 Split strategy

Split by **account id**, not by transaction row and not by cutoff row. Every cutoff belonging to one account stays in one split.

- 70% train, 15% validation, 15% holdout.
- Seed **42**.
- Model A, if trained, is also stratified by `y_auth`.
- If templates or counterparties repeat heavily, add a stress test that holds out a slice (for example high-CV accounts) and report it separately.

### 9.2 Leakage controls

- Features use only data up to `T`. Labels use only data after `T`.
- Do not use `y_auth`, `y_stress`, loan status, archetype labels, or generator-only flags as model inputs.
- Do not use requested loan amount, CIBIL, gender, religion, caste, birth date, or district / locality as features.
- Berka loan status is a sanity-check target only. It is not `y_stress`.
- If `p_auth` is ever used in Model B, generate it out-of-fold.
- Fit imputers, scalers, and calibration only on the split specified in sections 7 and 8.
- Row weights `1 / (rows per account)` are part of Model B training.

### 9.3 Artifacts

```text
ml/
  notebooks/
    model_b_berka.ipynb       # cells in section 21.1
    model_a_auth.ipynb        # after B
  features.py
  schema.json
  train_stress.py             # optional script mirror of the notebook
  train_auth.py
  evaluate.py
  policy.py
  service.py                  # FastAPI
  models/
    auth.joblib
    stress.joblib
    meta.json
  reports/
    metrics.json
    model_card_auth.md
    model_card_stress.md
```

`generate_shops.py` is not part of the training path. Add a small fixture generator only if GST or PDF-only demo rails are mocked, and label those rows `synthetic`.

**`models/meta.json`:**

```json
{
  "feature_schema_version": "1.0",
  "data_version": "berka-pkdd99",
  "auth_data_version": "pending-decision",
  "auth_model_version": "auth-v1",
  "stress_model_version": "stress-v1",
  "stress_model_variant": "B-inflow",
  "training_seed": 42,
  "feature_names_stress": [],
  "feature_names_auth": [],
  "lookback_weeks": 26,
  "cutoff_step_weeks": 4,
  "reference_emi_ratio": 0.35,
  "label_variant": "next_4w_net",
  "train_positive_rate": null,
  "auth_thresholds": { "low_below": 0.40, "high_at_or_above": 0.75 },
  "stress_thresholds": { "low_max": 0.20, "medium_max": 0.45 },
  "hyperparameters": {},
  "metrics": {},
  "package_versions": {},
  "trained_at": "ISO-8601 timestamp"
}
```

Also store the business-like filter thresholds that were actually used. The service rejects a request whose feature schema version does not match the artifact.

------------------------------------------------------------------------

## 10. Deterministic underwriting engine

This component is not an ML model and must not be delegated to an LLM.

### 10.1 Hard gates

Apply policy gates before a full limit is allowed:

- Incomplete or contradictory shop identity → `UNVERIFIED` or `DECLINE`, according to the issue.
- Zero verified rails → `UNVERIFIED`; no full limit.
- Identity mismatch or a severe authenticity concern → review or `DECLINE` under explicit policy.
- Maximum affordable EMI at or near zero → `DECLINE` or no offer.
- PDF-only applications cannot receive a `STANDARD` full limit.

`verified_rail_count` comes from rail metadata in `validate_application`, not from Model A.

### 10.2 Lean-month capacity

```text
lean_surplus_weekly = worst_4_week_net_inflow / 4
lean_surplus        = lean_surplus_weekly × (52 / 12)     # monthly-equivalent
haircut             = f(trust_class, p_stress, history_length)
max_emi             = max(0, lean_surplus × haircut)
max_principal       = PV(max_emi, rate, tenure)
```

`worst_4_week_net_inflow` is the minimum rolling 4-week net (inflow minus outflow) over the observation window, computed in code from the canonical cash-flow rows.

Implementation requirements:

- Use the same Monday-start weeks as the feature builder.
- Convert the weekly surplus to a monthly equivalent with `× 52/12`. Do not mix a weekly surplus into a monthly EMI formula without that conversion.
- When the path is B-inflow / UPI-only, outflow is missing. Do not treat missing outflow as zero inside the capacity engine unless the policy version explicitly defines an inflow-only surplus and labels the result **inflow-only estimate**, with the higher haircut.
- `residual_after_opex` is computed here only when a bank-statement rail exists. Otherwise it stays missing.
- Existing obligations and required operating liquidity are applied when the input actually contains them.
- Haircut values live in a versioned policy table. **The numeric table is not yet defined** (open item). Do not invent production haircuts in the model notebook.
- A negative surplus never produces a positive EMI.
- Present value, with `i` = rate per period and `n` = number of periods:

```text
PV = EMI × (1 − (1 + i)^(−n)) / i     if i ≠ 0
PV = EMI × n                           if i = 0
```

- Weekly repayment uses weekly periods (52 per year) and a weekly rate. Do not reuse the monthly formula unchanged.

### 10.3 Terms mapping

Output fields:

- Verdict: `DECLINE` | `UNVERIFIED` | `THIN_FILE` | `STANDARD` | `STEP_UP`.
- Eligible principal, capped at `min(requested, max_principal)` when a counteroffer is allowed.
- Tenure.
- Interest band / policy rate.
- Repayment cadence.
- Conditions.
- Maximum EMI and maximum principal.
- Top decision drivers.
- Policy version.
- `inflow_only_estimate` when outflow was not observed.

Risk band affects haircut and rate band. Capacity remains the binding limit. `p_stress` never approves or declines by itself.

Rate-band and tenure tables are open (section 24). Ship them as versioned policy, not as notebook constants duplicated in the API.

### 10.4 Counteroffer

If the requested amount exceeds maximum principal:

- Offer a principal at or below `min(requested, max_principal)`.
- Explain that the amount is limited by observed lean-month repayment capacity.
- Do not describe the applicant as dishonest or a bad business.
- The lender remains responsible for final review.

### 10.5 Stress slider

The slider changes lean inflow and/or outflow by a percentage and recomputes surplus, EMI, principal, and terms. It does not retrain Model A or Model B. The response includes `scenario_only: true`. The UI labels the result as a scenario simulation.

If a scenario is meant to re-score stress because features changed, that is a separate, clearly labelled inference call. The core MVP slider stays deterministic.

------------------------------------------------------------------------

# PART B — AGENTIC AI SPECIFICATION

## 11. Agentic AI design principles

The agent layer coordinates tasks and tools around the ML and underwriting services. It is not a second credit decision engine.

Recommended orchestration: **LangGraph** with a typed shared state and explicit conditional edges. The MERN + Python architecture stays:

- React owner and lender interfaces.
- Node / Express API and MongoDB.
- Python FastAPI ML service.
- Agent workflow invoked by the backend as a controlled internal service or module.

### 11.1 What agents may do

- Read structured application data and provenance.
- Call approved feature, model, reconciliation, and calculation tools.
- Identify missing or inconsistent information.
- Ask for additional evidence.
- Summarize model and policy outputs.
- Explain the terms and main drivers.
- Prepare an audit summary.
- Surface an inflow-only estimate when outflow is absent.

### 11.2 What agents may not do

- Invent or infer missing transaction values, including filling missing outflow with zero.
- Treat an unverified PDF as a verified rail.
- Change model probabilities, thresholds, or haircuts.
- Override hard policy gates.
- Approve or disburse a loan autonomously.
- Use gender, religion, caste, or other protected attributes to set terms.
- Make a fraud accusation from a model flag alone.
- Claim that Berka metrics are Indian MSME or UPI outcomes.
- Claim that synthetic or simulated rails are production integrations.

------------------------------------------------------------------------

## 12. Agent roster

The MVP should implement a small number of purposeful agents. Responsibilities may be combined into one node if time is limited. Tool arithmetic stays in code.

### Agent 1 — Underwriting Orchestrator

**Role:** Coordinate the application workflow and control execution order.

**Inputs:** application id, shop profile, rails and provenance, cash-flow records, requested amount.

**Tools:** `load_application`, `validate_application`, `build_features`, `score_authenticity`, `score_stress`, `run_underwriting_policy`, `write_audit_event`.

**Responsibilities:**

1. Load and validate the application.
2. Check provenance and verified-rail count.
3. Route zero-verified-rail applications to `UNVERIFIED`.
4. Invoke financial analysis, then Model B. Invoke Model A (or the rule-based score) when the chosen authenticity path is available.
5. Call the deterministic underwriting engine.
6. Request explanation and audit summary.
7. Return the structured result to the lender workflow.

**Guardrail:** The orchestrator controls sequence. It does not choose the loan amount with free-form LLM reasoning.

### Agent 2 — Financial Data Analyst

**Role:** Turn authorized, public, or labelled-synthetic rails into the canonical cash-flow table and a weekly series.

**Tools:** `parse_aa_payload_demo`, `parse_upi_transactions`, `parse_gst_summary`, `extract_invoice_fields`, `reconcile_financial_rails`, `build_financial_features`.

**Responsibilities:**

- Normalize dates, directions, and amounts into the schema in section 5.
- Build the Monday-start weekly series with `features.py`.
- Summarize inflows and outflows.
- Compare GST, UPI, and bank totals when both sides exist. Missing GST yields a flag, not a zero gap.
- Identify missing periods.
- Count extracted invoices in code and mark them `unverified`.
- Preserve source references and provenance.

**Guardrail:** Arithmetic and reconciliation are code. The LLM may summarize the tool result. It must not calculate totals from free-form text.

### Agent 3 — Authenticity Investigator

**Role:** Interpret Model A or the rule-based score, plus deterministic rail checks, and decide whether more verification is needed.

**Tools:** `score_authenticity`, `check_rail_identity`, `check_transaction_freshness`, `check_payer_concentration`, `check_gst_upi_gap`, `create_verification_request`.

**Responsibilities:**

- Read `p_auth` (or the rule score) and its version.
- Review identity mismatch, concentration, roundness, freshness, and cross-rail gap flags.
- Keep model signals distinct from hard identity failures.
- Recommend `UNVERIFIED`, additional verification, or policy review.
- Produce a concise evidence summary.

**Guardrail:** Do not label an applicant fraudulent because of a high anomaly score. Seasonal, cash-heavy, new, and single-customer businesses need careful review. If Model A was trained on IBM AML, the explanation must say the score reflects that synthetic dataset.

### Agent 4 — Cash-Flow and Stress Analyst

**Role:** Explain cash-flow behaviour and the Model B result.

**Tools:** `calculate_weekly_cashflow`, `calculate_lean_period`, `score_stress`, `get_feature_drivers`. Optional: `forecast_cashflow_demo`.

**Responsibilities:**

- Summarize typical and weak periods.
- Identify trend and volatility from `slope_rel` and `cv_weekly_inflow`.
- Interpret calibrated `p_stress` and the risk band.
- State the target definition and that `EMI_ref = 0.35 × M`.
- Say when the result is an inflow-only estimate.
- Compute `residual_after_opex` only when a bank statement exists.
- List the strongest drivers with the wording in section 7.7.

**Guardrail:** Model B predicts the proxy label in section 7.2, not actual loan default and not an MSME outcome.

### Agent 5 — Loan Structuring / Terms Agent

**Role:** Present the deterministic engine in a lender-usable form.

**Tools:** `run_underwriting_policy`, `calculate_max_emi`, `calculate_max_principal`, `generate_counteroffer`, `simulate_repayment_schedule`.

**Responsibilities:**

- Request maximum EMI and principal from the engine.
- Present tenure, interest band, and cadence from the versioned policy.
- Compare the requested amount with maximum affordable principal.
- Present a counteroffer when appropriate.
- Explain conditions and step-up eligibility if enabled.
- Surface the inflow-only haircut when it applied.

**Guardrail:** The agent cannot invent interest rates, change haircuts, or exceed `max_principal`. A change requires a policy-version update or a recorded human override.

### Agent 6 — Explainability Agent

**Role:** Convert drivers and policy calculations into concise explanations for lenders and owners.

**Inputs:** model outputs, top drivers, rail flags and provenance, capacity calculations, terms, verdict, policy version, sanity-check and dataset caveats that the product is allowed to show.

**Responsibilities:**

- Explain why the verdict is `UNVERIFIED`, `THIN_FILE`, `STANDARD`, `STEP_UP`, or `DECLINE`.
- Explain maximum EMI and principal in plain language, including the `52/12` monthly equivalent when it matters to the number.
- Distinguish verified, simulated, and synthetic evidence.
- Explain what additional information could resolve uncertainty.
- Use non-stigmatising language.

**Example:**

> The application has no credit bureau file. The assessment uses the available UPI rail and is marked as an inflow-only estimate because expenses were not observed. The proposed amount is limited by the weakest four-week period. One payer contributes a high share of incoming credits, so the lender should review that concentration flag.

**Guardrail:** Every factual statement maps to a structured field, model driver, or policy calculation.

### Agent 7 — Fairness and Audit Agent

This can be two deterministic tools plus one reporting node.

**Fairness:**

- Load twin applications.
- Hold financial fields, rail evidence, provenance, history, and requested amount constant.
- Change only protected-attribute flags in the test fixture.
- Re-run the deterministic pipeline.
- Compare verdict, principal, rate band, tenure, and cadence.
- Report any difference. The comparison is code, not an LLM judgement.

**Audit, on every score and every human override, including early `UNVERIFIED`:**

- Input payload hash.
- Model versions, variant (`B-inflow` or `B-full`), feature schema version.
- Policy version, `reference_emi_ratio`, label variant.
- Predictions and terms.
- Agent workflow version.
- Human override actor, reason, and changed terms.

**Guardrail:** Protected attributes stay in a segregated fairness fixture. They are not passed into the model feature vector or the terms calculation.

------------------------------------------------------------------------

## 13. LangGraph workflow

### 13.1 Shared state

```python
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
    authenticity_method: str          # "model" or "rules"

    p_stress: float
    stress_band: str
    stress_variant: str               # "B-inflow" or "B-full"
    stress_drivers: list[dict]
    inflow_only_estimate: bool

    reconciliation: dict              # gst gap, flags
    invoice_evidence: dict            # count, trust class unverified
    supporting_signals: list[dict]    # name, value, source, affects

    capacity: dict
    terms: dict
    verdict: str

    explanation: dict
    fairness_result: dict
    audit_reference: str
    errors: list[dict]
```

### 13.2 Workflow

```text
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
Canonical cash-flow normalization and weekly series
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
Model B — Stress (B-inflow or B-full from available rails)
  |
  v
Authenticity path (Model A or rule score) and policy gate
  |
  v
Lean-month capacity
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
Fairness check (separate evaluation route)
  |
  v
Audit write
  |
  v
END
```

Model B runs on the weekly series as soon as the rails are valid. Authenticity does not block the stress score, and the stress score does not approve the loan. The fairness twin workflow is an evaluation route, not a step on every live application. The audit write runs for every score and every human override, including early `UNVERIFIED`.

### 13.3 Failure handling

- If a required rail parser fails, return a structured data-quality error or `UNVERIFIED`. Do not fabricate a replacement value.
- If a model service is unavailable, fail closed for full underwriting and return a retry / manual-review state.
- If model metadata or the feature schema version is incompatible, reject the scoring request.
- If the LLM explanation step fails, keep the deterministic decision and return a template explanation.
- If the audit write fails, do not report the workflow as fully completed. Surface an operational error and retry according to backend policy.

------------------------------------------------------------------------

## 14. Tool contracts

Tools are small, typed, testable functions.

| Tool | Input | Output |
| --- | --- | --- |
| `load_application` | `application_id` | Shop, rails, cashflows, requested amount |
| `validate_application` | Application payload | Validation result, errors, `verified_rail_count` |
| `build_features` | Canonical cashflows + shop metadata + variant | Feature vector, schema version, missing flags |
| `score_authenticity` | Model A features, or the rule inputs | `p_auth` or rule score, method, version |
| `score_stress` | Model B features + variant | Calibrated `p_stress`, band, version |
| `reconcile_financial_rails` | GST / UPI / AA summaries | Gaps and flags. Missing side stays missing |
| `extract_invoice_fields` | Uploaded invoices | Count and fields, trust class `unverified` |
| `run_underwriting_policy` | Predictions + capacity inputs + policy version | Verdict and terms |
| `simulate_repayment_schedule` | Principal, rate, cadence, tenure | Schedule |
| `run_fairness_twins` | Twin application ids | Offer deltas |
| `write_audit_event` | Event and input hash | Audit reference |

Every tool validates inputs and returns machine-readable errors. Agents do not call arbitrary shell commands, arbitrary URLs, or unrestricted database operations.

------------------------------------------------------------------------

# PART C — API AND DATA CONTRACTS

## 15. FastAPI service

### 15.1 Endpoints

```text
GET  /health
POST /score
POST /explain        # optional; may return the same driver payload
POST /stress-test    # deterministic scenario recalculation; no retraining
```

### 15.2 `/score` request

```json
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
      "provenance": "simulated"
    }
  ],
  "cashflows": [],
  "requested_amount_paise": 20000000,
  "policy_version": "v1"
}
```

The service chooses **B-inflow** when no bank / AA outflow rail is present, and **B-full** when outflow is present. It calculates outputs from the payload, the feature builder, and the saved artifacts. Example numbers in this document are shapes, not fixtures to hard-code.

### 15.3 `/score` response

```json
{
  "application_id": "APP_DEMO_001",
  "data_provenance": "simulated",
  "verified_rail_count": 1,
  "inflow_only_estimate": true,
  "p_auth": null,
  "authenticity_method": "rules",
  "p_stress": 0.17,
  "stress_variant": "B-inflow",
  "reference_emi_paise": 0,
  "reference_emi_ratio": 0.35,
  "target_definition": "next_4w_net_vs_0.35_own_monthly_inflow",
  "features": {},
  "drivers": [],
  "verdict": "THIN_FILE",
  "principal_paise": 0,
  "max_emi_paise": 0,
  "tenure_months": 10,
  "rate_bps": 1600,
  "cadence": "WEEKLY",
  "conditions": [],
  "policy_version": "v1",
  "model_versions": {
    "auth": "auth-v1",
    "stress": "stress-v1"
  },
  "feature_schema_version": "1.0",
  "metrics_disclaimer": "Model B was trained on Berka cash-flow dynamics, not on Indian MSME outcomes."
}
```

### 15.4 `/stress-test` request

```json
{
  "application_id": "APP_DEMO_001",
  "lean_inflow_delta_pct": -25,
  "lean_outflow_delta_pct": 0,
  "policy_version": "v1"
}
```

Response includes scenario assumptions, recomputed lean surplus, maximum EMI, maximum principal, updated terms, and `scenario_only: true`.

------------------------------------------------------------------------

## 16. Explainability contract

Use permutation importance and tree importances. SHAP is optional.

The payload retains feature name, observed value, reference or comparison, direction, source, and model or policy version.

Wording follows section 7.7. Dataset caveats (Berka proxy, IBM synthetic if used, inflow-only estimate) are part of the lender explanation, not a footnote that the UI may drop.

------------------------------------------------------------------------

# PART D — EVALUATION, FAIRNESS, AND SAFETY

## 17. Evaluation plan

### 17.1 Model evaluation

Separate reports for Model B (both variants) and Model A or the rule-based score.

Model B report includes:

- Train positive rate at `r = 0.35`, and the flag if it is outside 15–40%.
- Holdout size, class balance, and account counts (not just row counts).
- ROC-AUC, PR-AUC, precision, recall, F1, confusion matrix, Brier score.
- Majority-class baseline.
- Breakdowns in section 7.4.
- Loan-status sanity check with a bootstrap confidence interval.
- The sentence: these are cash-flow dynamics on real bank data, not MSME or UPI outcomes.

Model A report, if the IBM path is chosen, includes precision and recall on `y_auth = 0`, PR-AUC, and the false-positive review. It states that IBM is synthetic and short.

### 17.2 Product-level evidence

Compare:

1. **Baseline:** `DECLINE if no CIBIL`. On a thin-file demo cohort the baseline funded count is zero.
2. **Nidhi:** number of demo shops receiving an offer, with the proxy stress rate among offered shops.

Optional second baseline: approve if median inflow exceeds a fixed threshold and authenticity is ignored. Use it to show a high-inflow concentrated profile that passes a size threshold and fails the authenticity gate.

Label the cohort's provenance on the chart. Do not describe the comparison as measured lift on real Indian MSMEs. If the cohort is Berka, say so. If demo shops are simulated, say so.

### 17.3 Fairness evaluation

For each twin pair, keep financial features, rail evidence, business history, and requested amount identical. Change only the protected-attribute flag in the fixture. Run the same policy version. Compare verdict, principal, interest band, tenure, and cadence in code.

Acceptance target for exact twins:

- Principal difference = ₹0.
- Rate-band difference = 0.
- No change in verdict, tenure, or cadence.

Any difference fails the test.

### 17.4 Failure analysis

Discuss, with examples from the holdout or from labelled fixtures:

- New genuine shops with short history (`active_week_ratio`, `history_weeks`).
- Cash-heavy businesses with incomplete digital evidence (low digital share; higher uncertainty, not an automatic fraud flag).
- Seasonal-like high-CV series.
- One dominant legitimate counterparty (`max_payer_share`).
- Incomplete or delayed GST / bank evidence (reconciliation flag, not a zero).
- UPI-only applications where outflow is missing.

The system asks for more evidence when uncertainty is the issue, rather than forcing a decline.

------------------------------------------------------------------------

## 18. Responsible AI, privacy, and controls

- Train Model B on the public anonymized Berka dataset. Do not scrape or upload live customer data into the notebook.
- Demo rails that are not Berka are `simulated` or `synthetic`, and the UI says which.
- If real UPI statements are added later, obtain explicit consent and keep them separate from Berka training rows.
- Minimize collection and retention of personal data.
- Keep protected attributes and district demographics out of model inputs and underwriting calculations.
- Restrict protected-attribute fixtures to fairness evaluation.
- Do not use a shop's city or locality as an unexplained proxy for creditworthiness.
- Do not treat cash-heavy activity or short history as proof of fraud.
- Keep human review for adverse or ambiguous outcomes.
- Provide clear, non-stigmatising explanations and a way to correct inaccurate data.
- Record model, feature, policy, label variant, and agent versions for every decision.
- Do not claim RBI approval, production Account Aggregator access, zero fraud, or real-world default prediction.
- Do not claim that a Berka AUC is an Indian MSME result.

------------------------------------------------------------------------

# PART E — DELIVERY

## 19. MVP priorities

| Priority | Feature | Why it matters |
| --- | --- | --- |
| P0 | Model B on Berka, B-inflow and B-full, calibrated `p_stress` | Core technical depth and the first model |
| P0 | Verified vs unverified rail gate | Stops PDF-only full limits |
| P0 | Lean-month capacity and versioned terms | Answers which / how much / on what terms |
| P0 | Stress slider (`scenario_only`) | Shows terms under a weaker lean period |
| P0 | Explainable drivers | Lender-readable result |
| P0 | Provenance badges (`real` / `simulated` / `synthetic`) | Honest demo |
| P0 | Baseline vs Nidhi evidence, labelled with the actual cohort | Measurable comparison |
| P0 | Fairness twin test | Same terms for identical financial profiles |
| P0 | Audit entry per score and override | Traceability |
| P0 | Inflow-only estimate labelling and haircut path | Matches UPI rails that have no expenses |
| P1 | Model A, or the documented rule-based score | Authenticity without hiding it inside `p_stress` |
| P1 | Agent investigation of authenticity exceptions | Visible exception handling |
| P1 | Automated underwriting report | Lender workflow |
| P1 | Counteroffer explanation | Why a smaller amount is proposed |
| P1 | Loan-status sanity check in the model card | Shows whether the proxy tracks real Berka defaults |

## 20. Optional later features

These are not MVP dependencies.

- **MSME financial digital twin.** Scenario layer for a revenue decline or an expense increase, recomputing affordability. The stress slider already covers the thin version.
- **Credit readiness assistant.** What additional verified evidence could complete an assessment. It must not promise approval.
- **Early stress monitoring.** With ongoing consent, flag worsening cash flow. It must not silently change an existing loan.
- **Alternative credit passport.** Consent-controlled summary of verified cash-flow evidence. Raw transactions stay private by default.
- **Portfolio intelligence.** Aggregated, governed trends by category and risk band.
- **Multilingual copilot.** Kannada, Hindi, or English questions grounded in the structured assessment.

------------------------------------------------------------------------

## 21. Implementation sequence

### 21.1 Phase 1 — Model B in Jupyter

Notebook cells, in order:

1. Imports and seed 42.
2. Load Berka `account`, `trans`, and `loan` (semicolon-separated `.asc`).
3. Canonicalize rows and parse YYMMDD dates.
4. Digital-inflow extraction and the business-like account filter.
5. Monday-start weekly series.
6. Cutoff loop: features plus the label at `r = 0.35`. **Print the train-split positive rate** (and the rate on all labelled cutoffs). Flag if it is outside 15–40%.
7. Split by account, 70 / 15 / 15, seed 42. Apply row weights.
8. Train logistic regression and histogram gradient boosting with `GroupKFold`.
9. Calibrate on validation, choose thresholds, evaluate, and write breakdowns.
10. Loan-status sanity check with a bootstrap confidence interval.
11. Save `stress.joblib`, `meta.json`, `metrics.json`, and the Model B card.
12. Only then start Model A, reusing the weekly aggregation code.

**Exit criteria:** Both variants load from disk and return stable versioned predictions for a fixed account fixture. The positive rate and the sanity-check AUC are written down. `r` is still 0.35 unless a joint decision changed it and the model card says so.

### 21.2 Phase 2 — Underwriting and API

1. Verified-rail hard gates.
2. Lean-month surplus with the `52/12` conversion, including the inflow-only path.
3. Versioned haircut and terms mapping once the open policy numbers are set. Until then, a single checked-in draft table is allowed if it is marked draft and versioned.
4. Maximum EMI and principal, including the zero-rate PV case.
5. `GET /health`, `POST /score`, `POST /stress-test`.
6. Model and policy metadata on every response, plus the Berka disclaimer.

**Exit criteria:** A UPI-only kirana receives numeric terms marked inflow-only. A PDF-only shop cannot receive `STANDARD`. The slider recalculates terms and does not retrain.

### 21.3 Phase 3 — Authenticity and agents

1. Resolve section 8.6 (IBM model or rules) and record it.
2. Typed LangGraph state from section 13.1.
3. Validation, provenance, weekly features, reconciliation, and invoice tools.
4. Model B tool, then the authenticity tool.
5. Deterministic underwriting node.
6. Grounded explanation node with a template fallback.
7. Audit writes and the failure behaviour in section 13.3.

**Exit criteria:** A clean application and an unverified or suspicious application both finish with structured, traceable outputs.

### 21.4 Phase 4 — Evidence

1. Fairness twin runner.
2. Baseline comparison with an honest cohort label.
3. Lender-facing explanation.
4. Stress-scenario view.
5. Optional digital twin only after the core workflow is stable.

**Exit criteria:** The demo can show a clean kirana, a PDF-only shop, a concentrated payer, a GST mismatch fixture, a volatile genuine series, the stress slider, fairness twins, and the baseline. Each screen shows provenance.

------------------------------------------------------------------------

## 22. Repository layout

```text
repo/
  apps/
    web/                       # React owner + lender SPA
    api/                       # Node.js + Express BFF
  ml/
    notebooks/
      model_b_berka.ipynb
      model_a_auth.ipynb
    features.py
    schema.json
    train_auth.py
    train_stress.py
    evaluate.py
    policy.py
    service.py
    agent_graph.py
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
    berka/                     # local .asc files; do not commit if license requires a download step
    fixtures/                  # PDF-only, GST, twins; provenance labelled
  docs/
    spec-new.md
```

Adapt filenames to the existing repository. Do not stand up a second scoring service beside one that already exists.

------------------------------------------------------------------------

## 23. Acceptance criteria

### ML

- [ ] Model B is trained before Model A, on Berka, with digital inflow limited to `PREVOD Z UCTU` after the documented exclusions.
- [ ] `EMI_ref = 0.35 × M`, and the train positive rate is reported. A rate outside 15–40% is flagged rather than fixed by changing `r`.
- [ ] Features match section 6.2 for the declared variant. Raw size, loan amount, protected attributes, and district are absent.
- [ ] Split is by account id, 70 / 15 / 15, seed 42, with all cutoffs of an account together and row weights applied.
- [ ] Imputers, scalers, and calibration are fit on the correct split. Missing features are not zero-filled.
- [ ] Calibrated `p_stress`, risk band, variant, and schema version are returned at inference.
- [ ] The loan-status sanity check is in the model card and was not used as `y_stress`.
- [ ] Metrics are described as Berka cash-flow dynamics.
- [ ] Model A is either an IBM account-level model with the caveats in section 8, or an explicit rule-based score. The choice is written down.

### Underwriting

- [ ] Zero verified rails returns `UNVERIFIED`.
- [ ] PDF-only applications cannot receive `STANDARD`.
- [ ] Lean surplus uses worst 4-week net / 4, then `× 52/12`.
- [ ] UPI-only applications are marked inflow-only and use the policy haircut for that path.
- [ ] Requested amount above capacity produces a counteroffer at or below `min(requested, max_principal)`.
- [ ] Terms come from a versioned policy.
- [ ] The stress slider recalculates scenario terms, sets `scenario_only: true`, and does not retrain.

### Agents

- [ ] Agents use explicit typed tools.
- [ ] Agents cannot change model outputs, thresholds, or haircuts.
- [ ] Explanations are grounded, use "contributed to", and keep the proxy-target wording.
- [ ] Suspicious signals trigger review or verification, not an unsupported accusation.
- [ ] Parser, model, schema, and audit failures follow section 13.3.
- [ ] An audit event is written for every score and human override.

### Fairness and demo

- [ ] Exact twins receive identical terms.
- [ ] Protected attributes are excluded from model and underwriting features.
- [ ] Every rail is labelled `real`, `simulated`, or `synthetic`.
- [ ] The baseline comparison names its cohort.
- [ ] The prototype does not claim RBI approval or validation on live MSME outcomes.

------------------------------------------------------------------------

## 24. Open items

These are unresolved on purpose. Do not close them inside a notebook without recording the decision in `meta.json` and the model card.

1. **Positive rate at `r = 0.35`**, and whether the label stays next-4-week net, switches to inflow-only, or switches to the worst 4-week net inside the next 12 weeks.
2. **Model A data:** IBM AML (synthetic, short timespan) versus a rule-based score until real labels exist.
3. **10–20 real consented UPI statements** for a transfer check. The Kaggle UPI file does not satisfy this.
4. **Haircut table, rate band, and tenure** policy values.
5. **GST and PDF-only cases** stay rule-based or small mocked fixtures, labelled `synthetic`.
6. **Business-like filter thresholds** (52 weeks, 26 digital weeks, 5 counterparties) after the first Berka count of how many accounts survive.
7. **Blank Berka `operation` values**, once counted, and whether any of them are true incoming transfers.
8. **IBM HI laundering rate** (about 0.10% versus a README claim of about 5%), verified before any Model A training.

------------------------------------------------------------------------

## 25. Product thesis

> **We don't approve people. We price verified lean-month surplus, and we don't let PDFs print a limit.**

Model B estimates proxy lean-period stress from scale-free weekly cash-flow dynamics. Model A, or its rule-based stand-in, estimates whether the records look authentic. The deterministic engine computes repayment capacity and terms. Agents coordinate the evidence and explain the outcome. The lender remains accountable for the final credit decision.

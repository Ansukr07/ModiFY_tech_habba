# User transaction data to model-ready inputs

**Purpose:** implementation contract for converting uploaded transaction or bank-statement rows into the account features expected by the two trained models. This describes the training notebooks' transformations; it does not claim the models have been validated on real Indian MSME or UPI data.

## 1. Shared ingestion and conventions

1. Parse the upload into transaction rows with, at minimum, a transaction timestamp, amount, account identifier, transaction direction/type, and (where available) counterparty identifier. Preserve the original currency and debit/credit meaning. Do not infer direction from a signed amount unless the source format documents that convention.
2. Parse dates to timestamps and amounts to numeric values. Rows with invalid dates cannot be placed in time buckets; missing amounts or account IDs cannot contribute to amount features. Keep a record of excluded rows and reasons. Normalize timestamps to one consistent timezone before deriving dates/weeks.
3. Map source columns/codes into the canonical fields required by the selected model. Mapping is source-specific: Model A requires a receiver account and payer for credits; Model B requires a reliable account, digital-credit classification, and debit classification. Never silently treat all credits as qualifying digital inflows.
4. Aggregate separately for each account. Build Monday-start weeks (equivalent to weeks ending Sunday). When a feature requires a regular weekly series, insert zero-valued weeks only between that account's first and last observed transaction weeks. Never fill weeks before the account's first observed activity or after its last observed activity.
5. At inference, apply the exact feature order and preprocessing stored with the model artifact. Missing numeric feature values are median-imputed by the fitted training imputer (with missingness indicators). Do not refit the imputer on user uploads. Scores are raw, uncalibrated model outputs.
6. Keep deterministic checks such as identity matching, verified-rail counts, GST mismatch handling, and affordability/capacity calculations outside these ML feature vectors unless a later model is explicitly trained to use them.

## 2. Model A — transaction authenticity

**Artifact/schema:** `models/auth.joblib`, feature schema `1.0`. One input row per account. Feature order: `payer_hhi`, `max_payer_share`, `round_amount_ratio`, `history_weeks`, `empty_then_spike`.

### Required canonical data

- Credit/receiver transactions with timestamp, payer/sender account, receiving account, received amount, and receiving currency.
- Laundering labels are needed only for reproducing training/evaluation labels, not at inference. In training, a transaction labeled laundering marks both participant account IDs suspicious: sender and receiver. Account label is `0` if it ever participates in a labeled transaction, otherwise `1`; the model's positive score is for suspicious class after the notebook's `y_susp=(y_auth==0)` inversion.
- If a bank statement lacks payer identity or currency, those missing fields must be explicitly mapped/handled; the training logic substitutes `__UNKNOWN_CASH__` for a missing payer and chooses a dominant currency among receiver credits.

### Preparation

1. Retain rows with valid timestamp, receiver account, and received amount. Convert account and payer identifiers to strings; replace missing payer with `__UNKNOWN_CASH__`.
2. Derive Monday-start week from each timestamp.
3. For each receiver account, choose its dominant receiving currency (most frequent non-missing currency; ties follow the first mode returned by pandas in training). Keep only transactions in that currency for all following features. Currency units must remain consistent with the training convention; the round-amount thresholds are expressed in source currency units, not converted exchange rates.
4. For each account-payer pair, sum received amounts over the retained history. Divide each payer's total by the account's total received amount; these are payer shares. A payer is the sender account identifier, including the single unknown-payer bucket when missing.
5. Aggregate the retained credits by account and week. Weeks with no retained credit are absent from the `weekly` table in the current notebook; `history_weeks` therefore counts weekly rows with credits (not calendar age). For the spike calculation, gaps between observed week rows are treated as zero weeks.

### Features, individually

| Feature | Calculation | Notes |
|---|---|---|
| `payer_hhi` | For each payer, `share = payer_total / account_total`; sum `share²` across distinct payers. | Range is approximately 0–1. Concentration rises as fewer payers provide the credits. |
| `max_payer_share` | Maximum payer share among the account's payers. | Uses the same payer totals and denominator as `payer_hhi`. |
| `round_amount_ratio` | Count retained receiver-credit transactions whose received amount is divisible by 100 **or** 500 **or** 1000, divided by count of retained receiver-credit transactions. | The divisibility checks use `isclose(amount mod unit, 0)` as implemented. The 100 test subsumes exact multiples of 500/1000; do not change the units without retraining. |
| `history_weeks` | Number of observed account-week rows after currency filtering (`count` of weekly transaction counts). | This is observed active-credit week count, not elapsed weeks since first activity. |
| `empty_then_spike` | Binary, initially 0. Calculate median and MAD over positive weekly inflow values, where `MAD = median(abs(value - median))`; spike threshold = `median + 5*MAD`. Scan observed weeks in order, counting explicit zero-inflow weeks and gaps between observed weeks. Set to 1 if at least 8 consecutive zero weeks are followed by a weekly inflow strictly above threshold. | A value equal to the threshold is not a spike. The reference notebook implements gap counting and resets the zero run after each positive observed week. |

### Output and interpretation

Pass the five values in the artifact's exact order to the saved imputer and selected estimator. The suspicious-class raw score/threshold is for review, not a calibrated probability. The handoff's descriptive bands are LOW below 0.40, MEDIUM from 0.40 to below 0.75, HIGH at/above 0.75; verify the consuming application applies these bands to the intended score. The fitted decision threshold is separately stored in the artifact and should not be confused with those bands.

## 3. Model B — cash-flow stress

**Artifact/schema:** `models/stress.joblib`, version `stress-v1`, feature schema `1.0`. It contains two variants because the inflow-only scoring route does not require outflows or payer IDs:

- **B-inflow**, exact feature order: `p10_rel`, `cv_weekly_inflow`, `slope_rel`, `lean_month_ratio`, `active_week_ratio`, `cv_missing`.
- **B-full**, exact feature order: the six above, then `outflow_ratio`, `log1p_unique_payers`.

### Required canonical data and account weeks

Training uses Berka transaction codes. Its qualifying **digital inflow** is a credit (`type == PRIJEM`) with operation `PREVOD Z UCTU`, excluding symbol codes `DUCHOD` and `UROK`. Cash deposits, pension and interest do not count. In a new source, map only equivalent verified digital credits into this canonical field; do not assume every bank credit is digital inflow. Training outflow is amount from transaction types `VYDAJ` or `VYBER`. Create per-account weekly totals `W` (qualifying digital credits) and `O` (outflows), on Monday-start weeks; zero-fill between that account's observed first and last transaction weeks.

The training feature window is the **26 weeks before and including cutoff** as represented by the preceding 26 entries of the weekly series. The following four weeks are used only to construct the training label, never as input features. For a live score, use the most recent 26 complete weeks and do not include a partial/current week unless the serving contract explicitly matches the training cutoff convention. The training examples advance cutoff by four weeks.

### Features, individually

Let `x[0..25]` be weekly qualifying digital inflows in the 26-week history, `o[0..25]` weekly outflows, and `M = median(sum(x[i:i+4]) for i in {0,4,8,12,16,20})` (six non-overlapping four-week totals). These six blocks match the notebook; do not substitute rolling four-week totals for `M`.

| Feature | Calculation | Undefined / edge handling |
|---|---|---|
| `p10_rel` | `percentile(x, 10) / M`. | NaN if `M <= 0`; training imputer handles NaN. |
| `cv_weekly_inflow` | Sample standard deviation of weekly inflows (`ddof=1`) divided by mean weekly inflow. | NaN if mean `<= 0`. |
| `slope_rel` | Fit a first-degree least-squares line to the last 13 weekly inflows, indexed 0–12; take its slope divided by the mean of those 13 values. | NaN if last-13-week mean `<= 0`. The 13 points are within the same 26-week feature window. |
| `lean_month_ratio` | Form all 23 overlapping four-week sums from `x` (`rolling` window length 4, stride 1); divide the minimum sum by the median of those 23 sums. | NaN if the median rolling sum `<= 0`. |
| `active_week_ratio` | Number of weeks where `x > 0`, divided by 26. | Always defined for a valid 26-week series. |
| `cv_missing` | Integer 1 if weekly mean `<= 0` or sample standard deviation is non-finite; otherwise 0. | Explicit missingness flag for CV. Other undefined ratios are imputed by the saved model pipeline. |
| `outflow_ratio` (B-full only) | Clip `sum(o) / sum(x)` into `[0, 5]`. | NaN if `sum(x) <= 0`. |
| `log1p_unique_payers` (B-full only) | Count distinct counterparty keys over qualifying historical digital-inflow transactions, then `ln(1 + count)`. Berka key is `bank + '|' + account`, with null components converted to empty strings. | The notebook's counterparty count is computed over the full available account history, not just the 26-week window. A serving implementation must use the same declared history scope to match training. |

### Training-only target and cohort rules (context, not inference features)

For each training cutoff, reference EMI is `0.35 * M`. Let `future_W` and `future_O` be the next four weeks' totals; label `y_stress = 1` when `future_W - future_O < reference_emi`, else 0. This is a derived cash-flow proxy, not observed default. No future values are allowed into inference features.

The notebook's intended eligibility screen is at least 52 observed account weeks, at least 26 digital-active weeks, and at least five distinct digital counterparties. However, the supplied Berka data had no accounts meeting the five-counterparty filter (partner identifiers yield at most one distinct value per account), so training explicitly falls back to a research cohort meeting the first two conditions. Production must not silently claim that the strict cohort was trained: either support the same flagged fallback logic or retrain after defining a counterparty key/filter that the source can actually satisfy. For a user upload with under 26 weeks of usable history, do not fabricate zero weeks before the observed life; report insufficient history or follow a separately defined product policy.

### Output and interpretation

The raw XGBoost output represents the training proxy class and is uncalibrated. B-inflow and B-full have separate validation-selected decision thresholds stored in the artifact. The metadata's LOW/MEDIUM/HIGH cut points are 0.20 and 0.45. Do not interpret the score as a probability of default or make it a standalone approval/decline decision. The train positive rate was about 85.7%, outside the target handoff's approximate 15–40% range; the notebook kept the user-fixed `0.35` ratio and flagged this imbalance.

## 4. Implementation checks before connecting uploads

- Confirm every incoming file format has a documented mapping to account, date, signed amount or debit/credit direction, currency, payer/counterparty, and digital-vs-cash classification.
- Preserve the model-specific semantics: Model A counts receiver credits and payer concentration; Model B measures qualifying digital inflow and outflow over a 26-week weekly series.
- Handle duplicate rows, reversals, pending transactions, and statement opening/closing balances consistently with the source. The training notebooks do not define special reversal, duplicate, or balance-reconciliation logic; do not invent it silently.
- Validate the generated feature names, order, missing-value behavior, units, and expected history length against the artifact metadata before scoring.
- Model A training history spans only the short IBM AML simulation period. Both models reflect their training datasets and feature-generation quirks; neither is validated on user-specific statement formats or real Indian MSME/UPI outcomes.


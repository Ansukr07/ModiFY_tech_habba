# Model Training Record

This file records the decisions and work for Model B (stress) and Model A (authenticity), based on the supplied **Nidhi ML Handoff (Model B first, then Model A)** and the datasets in this project.

## Shared decisions

- Environment: local Jupyter Notebook, Python, pandas, NumPy, scikit-learn preprocessing/evaluation, XGBoost classifiers, and `joblib` artifacts.
- Order: train Model B first, then Model A.
- Random seed: 42.
- Each model has its own notebook and artifact: `notebooks/01_model_b_stress.ipynb` and `notebooks/02_model_a_authenticity.ipynb`.
- Training/evaluation outputs are stored under `models/` and `reports/`.
- User-requested demo simplification: use plain XGBoost only, with no calibrated classifier or probability-calibration step. Probabilities saved in the artifacts are raw XGBoost outputs and must not be described as calibrated.
- These scores support review and analysis; neither model is an approval/decline engine. Deterministic identity/verified-rail gates and capacity calculations remain outside ML.

## Model B — stress model

**Data and target.** Uses the real anonymized Berka/PKDD'99 transactions and loan tables. The training target is a derived proxy, not a real default outcome: at each cutoff, positive if the following four weeks' net cash flow is below the reference EMI. Reference EMI is fixed at `0.35 × M`, where `M` is median monthly-equivalent inflow from the previous 26-week observation window. The value `r = 0.35` was explicitly fixed by the user and was not retuned.

**Preprocessing and features.** Berka files are semicolon-delimited; YYMMDD dates are parsed as dates. Digital inflows are incoming transfers (`PRIJEM` + `PREVOD Z UCTU`), excluding pension and interest codes. Weekly series are Monday-start and zero-filled only within each account's observed life. Four-week blocks and rolling sums support monthly-equivalent and lean-period features. The feature set includes relative weak-week inflow, weekly coefficient of variation and missing flag, relative 13-week slope, lean-month ratio, active-week ratio, and in B-full outflow ratio plus log distinct digital counterparties. Cash deposits, pension and interest do not count as digital inflow. Features use only history through cutoff; labels use only the future window.

**Eligibility constraint.** The handoff asks for 52 weeks of history, 26 digital-active weeks, and five distinct counterparties. In the supplied Berka data, 641 accounts meet the first two conditions, but zero meet the five-counterparty condition: Berka partner account identifiers produce at most one distinct transfer-counterparty value per account. The notebook records this and proceeds with the explicitly flagged research cohort meeting the first two conditions so training can proceed. No rows are synthesized.

**Split, training, and evaluation.** Cutoffs are split by account into 70/15/15 train/validation/test partitions, so an account never crosses partitions. The notebook trains separate plain XGBoost B-inflow and B-full variants, fits median imputation on training data, selects a demonstration F1 threshold on raw validation probabilities, then reports Brier score, accuracy, precision/recall/F1, and confusion matrices. It also reports a simple loan-status sanity check (status B/D). No calibration is performed.

**Observed run.** At `r = 0.35`, 29,108 cutoff rows from 641 accounts were produced. Train positive rate was 85.7%, outside the handoff's approximate 15–40% range. This was flagged and `r` was kept fixed. The test label prevalence was 83.9%; validation-selected thresholds yielded nearly all-positive predictions, so accuracy and F1 are strongly influenced by the high base rate and should not be interpreted as strong operational performance.

## Model A — authenticity model

### Hyperparameter tuning update

The existing Model A notebook `notebooks/02_model_a_authenticity.ipynb` searches both
XGBoost and Random Forest with scikit-learn `RandomizedSearchCV` and 3-fold
stratified cross-validation on the training partition only, scoring F1. The
validation partition then selects the final model and operating threshold; the
test partition is kept for the final estimate.

The tuned artifact is saved as `auth-v2-tuned`. Raw scores remain
uncalibrated, and the synthetic IBM AML provenance caveat still applies.

**Data and target.** Uses the supplied IBM AML HI-Small transaction dataset. The handoff identifies IBM AML as synthetic multi-agent simulation data and calls out the dataset choice as an open item. The user directed that Model A use IBM AML, so it is used with the synthetic provenance caveat preserved. The transaction label is aggregated to accounts: `y_auth = 0` if an account appears as sender or receiver in any laundering-labeled transaction; otherwise `y_auth = 1`.

**Preprocessing and features.** The large CSV is read in chunks. Receiver credits are aggregated by account and payer. Account currency is selected using its dominant receiving currency. The model features are payer HHI, maximum payer share, round-amount ratio using documented 100/500/1000 amount units, number of transaction weeks, and empty-then-spike indicator (at least eight zero-inflow weeks followed by an inflow above active-week median plus five MAD). No graph position, ring membership, generator/archetype flag, entity name, protected attribute, GST gap, or verified-rail count is used as a predictor.

**Split, training, and evaluation.** One account-level record per account is stratified into 70/15/15 train/validation/test sets with seed 42. Plain XGBoost is trained with imbalance handling; median imputation is fitted on training data. No probability calibration is used. Evaluation reports standard presentation metrics only: confusion matrix, accuracy, suspicious-class recall, and F1. ROC-AUC and PR-AUC are not included. The handoff's provisional authenticity bands are LOW below 0.40, MEDIUM from 0.40 to below 0.75, and HIGH at/above 0.75.

**Current comparison and limitations.** The notebook tunes XGBoost and Random Forest with class weighting only; no SMOTE or other synthetic oversampling is used. `RandomizedSearchCV` evaluates three sampled parameter configurations per algorithm with 3-fold training-only cross-validation using F1 scoring. Validation selects the final model and threshold; the held-out test split is used for final reporting. IBM AML spans a short period and is synthetic; these results describe its generator patterns, not real Indian MSME/UPI authenticity. Raw scores are not calibrated real-world fraud probabilities.
## Artifacts

Expected generated artifacts:

- `models/stress.joblib` — raw-score B-inflow and B-full XGBoost models and feature metadata.
- `models/auth.joblib` — Model A XGBoost estimator, imputer, selected threshold, and feature metadata; probabilities are uncalibrated.
- `models/meta.json` — shared version, feature, training, provenance, and metric metadata.
- `reports/metrics_stress.json`, `reports/metrics_auth.json` — model evaluation metrics.
- `reports/metrics_diagnostics.json` — reproducible class-balance, majority-baseline, specificity, and balanced-accuracy calculations derived from the reported held-out confusion matrices; generate with `python ml/derive_eval_diagnostics.py`. Updated training notebook cells now add ROC-AUC and average precision when reports are regenerated from held-out probabilities; current checked-in source metrics still need a full notebook rerun to populate them.
- `reports/model_card_stress.md`, `reports/model_card_auth.md` — intended use and limits.

The notebooks are organized into task-level cells with a markdown explanation before each stage and code comments within computational cells.

Pickle/joblib artifacts should only be loaded from trusted sources and require compatible package versions. See each notebook for the executable preprocessing and training details.

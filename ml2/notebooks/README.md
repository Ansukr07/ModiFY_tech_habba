# Nidhi model training notebooks

Run `01_model_b_stress.ipynb` first, then `02_model_a_authenticity.ipynb`.
The notebooks expect the project data folders `Berka_dataset/` and `IBM_AML/`
at the project root (or allow selecting/uploading the files when run elsewhere).
Outputs are written to `models/` and `reports/` at the project root.

The existing Model A notebook tunes XGBoost and Random Forest with
`RandomizedSearchCV` using 3-fold training-only cross-validation, then uses
validation for model/threshold selection and test only for final reporting.

Both notebooks use pandas, NumPy, scikit-learn, matplotlib, and joblib. No
synthetic rows are generated. IBM AML is itself a synthetic labeled dataset, as
documented in the handoff; its Model A metrics describe generator-pattern
classification only.

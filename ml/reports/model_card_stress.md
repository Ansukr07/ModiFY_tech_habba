# Stress model card (stress-v1)

Data: Berka/PKDD’99. Algorithm: XGBoost. Target: next-four-week net digital inflow below 0.35 × M; M is median prior non-overlapping four-week inflow block. Train positive rate: 85.688%. Account-grouped 70/15/15 split, seed 42. See metrics_stress.json for evaluation. This is a derived proxy, not observed default. Berka is not Indian MSME/UPI validation. Model raw XGBoost scores are uncalibrated and inform policy only; capacity math remains deterministic.

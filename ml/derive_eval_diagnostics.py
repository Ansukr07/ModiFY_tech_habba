"""Derive class-balance diagnostics from the checked-in threshold reports."""

import json
from pathlib import Path


REPORTS = Path(__file__).parent / "reports"


def diagnostics(matrix):
    if len(matrix) != 2 or any(len(row) != 2 for row in matrix):
        raise ValueError("Expected a 2x2 confusion matrix")
    tn, fp = matrix[0]
    fn, tp = matrix[1]
    if min(tn, fp, fn, tp) < 0 or tn + fp == 0 or fn + tp == 0:
        raise ValueError("Confusion matrix must have nonnegative counts for both classes")
    total = tn + fp + fn + tp
    specificity = tn / (tn + fp)
    recall = tp / (fn + tp)
    accuracy = (tn + tp) / total
    baseline = max(tn + fp, fn + tp) / total
    return {
        "negative_support": tn + fp,
        "positive_support": fn + tp,
        "positive_prevalence": (fn + tp) / total,
        "majority_baseline_accuracy": baseline,
        "accuracy": accuracy,
        "accuracy_minus_majority_baseline": accuracy - baseline,
        "specificity": specificity,
        "balanced_accuracy": (specificity + recall) / 2,
    }


def model_diagnostics(result):
    values = diagnostics(result["confusion_matrix"])
    for metric in ("roc_auc", "average_precision"):
        if metric in result:
            values[metric] = result[metric]
    return values


def main():
    stress = json.loads((REPORTS / "metrics_stress.json").read_text(encoding="utf-8"))
    auth = json.loads((REPORTS / "metrics_auth.json").read_text(encoding="utf-8"))
    models = {
        f"stress/{name}": model_diagnostics(result)
        for name, result in stress["variants"].items()
    }
    models.update({
        f"auth/{name}": model_diagnostics(result)
        for name, result in auth["per_model_test_results"].items()
    })
    saved_report = REPORTS / "metrics_saved_model_holdout.json"
    if saved_report.exists():
        saved = json.loads(saved_report.read_text(encoding="utf-8"))
        models.update({
            f"stress_saved/{name}": {
                **model_diagnostics(result),
                "matches_source_report": result["matches_source_report"],
            }
            for name, result in saved["results"].items()
        })
    has_auc = all("roc_auc" in model and "average_precision" in model for model in models.values())
    report = {
        "scope": "Derived from synthetic held-out confusion matrices at validation-selected thresholds; saved stress model metrics are included when available.",
        "auc_status": "Saved stress artifact ROC-AUC and average precision are reported separately; source reports still lack held-out probabilities." if not has_auc else "ROC-AUC and average precision included from held-out probabilities.",
        "models": models,
    }
    (REPORTS / "metrics_diagnostics.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

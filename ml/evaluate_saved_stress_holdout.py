"""Evaluate saved stress estimators on the notebook's grouped holdout; do not train."""

import json
import hashlib
import os
from pathlib import Path

import joblib
from sklearn.metrics import average_precision_score, balanced_accuracy_score, brier_score_loss, confusion_matrix, roc_auc_score


NOTEBOOK = Path(__file__).parent / "notebooks" / "01_model_b_stress.ipynb"
ARTIFACT = Path(__file__).parent / "models" / "stress.joblib"
SOURCE_REPORT = Path(__file__).parent / "reports" / "metrics_stress.json"
OUTPUT = Path(__file__).parent / "reports" / "metrics_saved_model_holdout.json"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recreate_holdout():
    os.chdir(Path(__file__).parent.parent / "ml2")
    notebook = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    namespace = {"__name__": "__main__", "display": lambda *args, **kwargs: None}
    for index in (2, 5, 8, 11, 14, 17):
        exec("".join(notebook["cells"][index]["source"]), namespace)
    return namespace["test"]


def main():
    test = recreate_holdout()
    artifact = joblib.load(ARTIFACT)
    source = json.loads(SOURCE_REPORT.read_text(encoding="utf-8"))
    labels = test.y_stress.to_numpy()
    results = {}
    for name, variant in artifact["variants"].items():
        scores = variant["model"].predict_proba(test[variant["features"]])[:, 1]
        predictions = scores >= variant["threshold"]
        matrix = confusion_matrix(labels, predictions).tolist()
        reported = source["variants"][name]
        tn, fp = matrix[0]
        fn, tp = matrix[1]
        results[name] = {
            "model_version": artifact["model_version"],
            "feature_names": variant["features"],
            "threshold": float(variant["threshold"]),
            "test_rows": int(len(labels)),
            "test_accounts": int(test.account_id.nunique()),
            "positive_prevalence": float(labels.mean()),
            "confusion_matrix": matrix,
            "source_report_confusion_matrix": reported["confusion_matrix"],
            "matches_source_report": matrix == reported["confusion_matrix"],
            "roc_auc": float(roc_auc_score(labels, scores)),
            "average_precision": float(average_precision_score(labels, scores)),
            "brier_score": float(brier_score_loss(labels, scores)),
            "specificity": float(tn / (tn + fp)),
            "balanced_accuracy": float(balanced_accuracy_score(labels, predictions)),
        }
        print(name, "matches source report:", results[name]["matches_source_report"], "ROC-AUC:", results[name]["roc_auc"], "average precision:", results[name]["average_precision"])
    OUTPUT.write_text(json.dumps({
        "scope": "Saved stress model estimators evaluated on the original account-grouped notebook holdout; no retraining.",
        "source_dataset": "ml2/Berka_dataset/trans.csv",
        "source_artifact": "ml/models/stress.joblib",
        "input_sha256": {
            "notebook": sha256(NOTEBOOK),
            "artifact": sha256(ARTIFACT),
            "source_report": sha256(SOURCE_REPORT),
        },
        "results": results,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

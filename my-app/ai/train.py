"""Train once on the training partition; evaluate and save the complete pipeline."""
import hashlib
import json
import math
import platform
import warnings
from pathlib import Path

import joblib
import pandas as pd
import sklearn
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

if __package__:
    from .predict import predict_message
else:
    from predict import predict_message

AI_DIR = Path(__file__).resolve().parent
DATASET_PATH = AI_DIR / "data" / "Customer_Message_Dataset.csv"
MODEL_PATH = AI_DIR / "models" / "customer_message_classifier.joblib"
REPORT_DIR = AI_DIR / "reports"
RANDOM_STATE = 42
SAMPLE_MESSAGES = [
    "Where is my order?",
    "I cannot login to my account",
    "Is this product available?",
    "My payment failed",
    "I want to cancel my order",
    "Do you have any discounts today?",
]


def make_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=1,
                           max_df=1.0, sublinear_tf=True, stop_words=None)


def message_key(message: str) -> str:
    # Stateless tokenization only, not vocabulary/IDF fitting. The chosen word
    # features treat case, whitespace and punctuation-only variants identically.
    tokenizer = make_vectorizer().build_tokenizer()
    return " ".join(tokenizer(message.lower()))


def distribution(series: pd.Series) -> dict:
    return {str(label): int(count) for label, count in series.value_counts().sort_index().items()}


def clean_data(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    if not {"message", "category"}.issubset(raw.columns):
        raise ValueError("CSV must contain the inspected message and category columns.")
    frame = raw.copy()
    frame["source_record"] = range(1, len(frame) + 1)
    missing = {}
    for column in raw.columns:
        values = raw[column].fillna("").astype(str)
        missing[column] = {
            "null_or_empty": int((raw[column].isna() | values.eq("")).sum()),
            "whitespace_only": int((values.ne("") & values.str.strip().eq("")).sum()),
        }
    for column in ["message", "category"]:
        frame[column] = frame[column].fillna("").astype(str).str.strip()
    invalid = frame.message.eq("") | frame.category.eq("")
    valid = frame.loc[~invalid].copy()
    exact_duplicates = int(valid.duplicated(["message", "category"]).sum())
    valid["message_key"] = valid.message.map(message_key)
    empty_tokens = valid.message_key.eq("")
    tokenless_count = int(empty_tokens.sum())
    valid = valid.loc[~empty_tokens].copy()
    conflicting = valid.groupby("message_key").category.nunique()
    if conflicting.gt(1).any():
        raise ValueError("Identical model inputs have conflicting category labels. Review the original dataset; no model was trained.")
    cleaned = valid.drop_duplicates("message_key", keep="first").reset_index(drop=True)
    counts = cleaned.category.value_counts()
    summary = {
        "columns": list(raw.columns), "message_column": "message", "label_column": "category",
        "id_column": "id" if "id" in raw.columns else None,
        "original_rows": len(raw), "sample_records": raw.head(8).fillna("").to_dict("records"),
        "missing_values": missing, "invalid_rows_removed": int(invalid.sum()),
        "exact_full_row_duplicates": int(raw.duplicated().sum()),
        "exact_trimmed_message_category_duplicates": exact_duplicates,
        "empty_token_rows_removed": tokenless_count,
        "additional_equivalent_input_duplicates": len(valid) - len(cleaned) - int(valid.duplicated(["message", "category"]).sum()),
        "total_duplicate_examples_removed": len(valid) - len(cleaned),
        "conflicting_input_groups": 0, "usable_rows": len(cleaned),
        "original_labeled_distribution": distribution(frame.loc[frame.category.ne(""), "category"]),
        "valid_before_dedup_distribution": distribution(frame.loc[~invalid, "category"]),
        "cleaned_distribution": distribution(cleaned.category),
        "largest_to_smallest_class_ratio": float(counts.max() / counts.min()) if len(counts) else None,
    }
    return cleaned, summary


def split_data(cleaned: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    if cleaned.category.nunique() < 2:
        raise ValueError("At least two usable categories are required for LogisticRegression.")
    counts = cleaned.category.value_counts()
    test_count = math.ceil(len(cleaned) * 0.2)
    notes = []
    rare = cleaned.category.isin(counts[counts < 2].index)
    candidates = cleaned.loc[~rare]
    # A singleton cannot appear in both partitions. Keep it in training rather
    # than accidentally evaluating a category the model has never learned.
    if rare.any():
        notes.append("Singleton categories kept in training only; test metrics cannot measure their recall.")
    category_count = candidates.category.nunique()
    if not category_count or test_count < category_count or len(candidates) - test_count < category_count:
        raise ValueError("Insufficient examples for a safe 80/20 held-out split. Add labeled examples; no evaluation/model saved.")
    train, test = train_test_split(candidates, test_size=test_count, random_state=RANDOM_STATE, stratify=candidates.category)
    train = pd.concat([train, cleaned.loc[rare]])
    if set(train.message_key) & set(test.message_key):
        raise AssertionError("Duplicate text leaked between training and test partitions.")
    return train, test, {"random_state": RANDOM_STATE, "requested_test_fraction": 0.2,
        "stratified": not bool(rare.any()), "common_classes_stratified": True,
        "training_rows": len(train), "test_rows": len(test), "notes": notes,
        "training_distribution": distribution(train.category), "test_distribution": distribution(test.category),
        "duplicate_input_overlap": 0}


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", make_vectorizer()),
        ("classifier", LogisticRegression(C=1.0, solver="lbfgs", max_iter=1000,
                                           class_weight=None, random_state=RANDOM_STATE)),
    ])


def format_confusion(matrix, labels) -> str:
    codes = [f"C{index + 1}" for index in range(len(labels))]
    lines = ["Held-out test confusion matrix: rows = actual; columns = predicted.", ""]
    lines += [f"{code}: {label}" for code, label in zip(codes, labels)]
    lines += ["", "     " + " ".join(f"{code:>4}" for code in codes)]
    lines += [f"{code:>4} " + " ".join(f"{int(value):4d}" for value in row) for code, row in zip(codes, matrix)]
    return "\n".join(lines) + "\n"


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    original_hash = hashlib.sha256(DATASET_PATH.read_bytes()).hexdigest()
    # Do not treat legitimate text like 'NA' as a missing value; empty CSV cells
    # are counted explicitly. All values are read as strings; IDs are metadata.
    raw = pd.read_csv(DATASET_PATH, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    cleaned, summary = clean_data(raw)
    print("DATASET SUMMARY")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    train, test, split = split_data(cleaned)
    print("SPLIT", json.dumps(split, indent=2))
    model = build_pipeline()
    # Fail clearly if optimization does not converge instead of saving silently.
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        model.fit(train.message, train.category)
    labels = list(model.classes_)
    predictions = model.predict(test.message)
    train_accuracy = float(accuracy_score(train.category, model.predict(train.message)))
    test_accuracy = float(accuracy_score(test.category, predictions))
    report = classification_report(test.category, predictions, labels=labels, output_dict=True, zero_division=0)
    report_text = classification_report(test.category, predictions, labels=labels, digits=4, zero_division=0)
    matrix = confusion_matrix(test.category, predictions, labels=labels)
    samples = []
    for message in SAMPLE_MESSAGES:
        key = message_key(message)
        membership = "training" if key in set(train.message_key) else "test" if key in set(test.message_key) else "not in cleaned dataset"
        samples.append({"message": message, **predict_message(message, model), "equivalent_dataset_match": membership})
    top_confusions = sorted([
        {"actual": actual, "predicted": predicted, "count": int(matrix[i, j])}
        for i, actual in enumerate(labels) for j, predicted in enumerate(labels) if i != j and matrix[i, j]
    ], key=lambda entry: (-entry["count"], entry["actual"], entry["predicted"]))
    print(f"TRAINING accuracy: {train_accuracy:.6f}")
    print(f"HELD-OUT TEST accuracy: {test_accuracy:.6f}\n{report_text}")
    print(format_confusion(matrix, labels))
    print("ACTUAL SAMPLE PREDICTIONS", json.dumps(samples, indent=2))
    if hashlib.sha256(DATASET_PATH.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError("Dataset changed during training; artifacts were not saved.")
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = MODEL_PATH.with_suffix(".tmp")
    try:
        joblib.dump(model, temporary, compress=3)
        temporary.replace(MODEL_PATH)
    finally:
        temporary.unlink(missing_ok=True)
    evaluation = {
        "dataset_path": "ai/data/Customer_Message_Dataset.csv", "dataset_sha256": original_hash,
        "dataset": summary, "split": split,
        "versions": {"python": platform.python_version(), "pandas": pd.__version__,
                     "scikit-learn": sklearn.__version__, "joblib": joblib.__version__},
        "vectorizer": model.named_steps["tfidf"].get_params(),
        "classifier": model.named_steps["classifier"].get_params(),
        "feature_count": len(model.named_steps["tfidf"].vocabulary_),
        "training_accuracy": train_accuracy, "test_accuracy": test_accuracy,
        "classification_report": report, "labels": labels, "confusion_matrix": matrix.tolist(),
        "confusions": top_confusions, "sample_predictions": samples,
        "model_path": "ai/models/customer_message_classifier.joblib",
        "model_sha256": hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest(),
    }
    # dtype is a class; stringify that single configuration value for JSON.
    evaluation["vectorizer"]["dtype"] = str(evaluation["vectorizer"]["dtype"])
    write_json(REPORT_DIR / "evaluation.json", evaluation)
    (REPORT_DIR / "classification_report.txt").write_text("HELD-OUT TEST PERFORMANCE\n" + report_text, encoding="utf-8")
    (REPORT_DIR / "confusion_matrix.txt").write_text(format_confusion(matrix, labels), encoding="utf-8")
    pd.DataFrame(matrix, index=labels, columns=labels).to_csv(REPORT_DIR / "confusion_matrix.csv", index_label="actual / predicted")
    manifest = pd.concat([train.assign(partition="training"), test.assign(partition="test")])
    manifest[[column for column in ["source_record", "id", "category", "partition"] if column in manifest.columns]].sort_values("source_record").to_csv(REPORT_DIR / "split_manifest.csv", index=False)
    print(f"Saved complete training-only pipeline: {MODEL_PATH}")


if __name__ == "__main__":
    main()

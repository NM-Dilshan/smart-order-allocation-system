"""Load the local fitted pipeline and return its actual class probability."""
import argparse
import json
import sys
from pathlib import Path

import joblib
from sklearn.pipeline import Pipeline

MODEL_PATH = Path(__file__).resolve().parent / "models" / "customer_message_classifier.joblib"


def load_model(path: Path = MODEL_PATH) -> Pipeline:
    """Only load artifacts you trust: joblib files can execute Python code."""
    if not path.is_file():
        raise FileNotFoundError(f"Model not found: {path}. Run python ai/train.py first.")
    model = joblib.load(path)
    if not isinstance(model, Pipeline) or not hasattr(model, "predict_proba"):
        raise ValueError("Expected a fitted classification Pipeline with predict_proba.")
    return model


def predict_message(message: str, model: Pipeline | None = None) -> dict:
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Customer message must be a non-empty string.")
    model = load_model() if model is None else model
    text = message.strip()
    category = model.predict([text])[0]
    probabilities = model.predict_proba([text])[0]
    class_index = list(model.classes_).index(category)
    return {"category": str(category), "confidence": float(probabilities[class_index])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message", nargs="?", help="Customer message, enclosed in quotes")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    parser.add_argument("--stdin-json", action="store_true", help="Read a JSON message object from standard input")
    args = parser.parse_args()
    if args.stdin_json:
        if args.message is not None:
            parser.error("Use either a message argument or --stdin-json, not both.")
        try:
            # Bound input before parsing. Customer messages are limited to 2000
            # UTF-16 units by the Node server; this also bounds direct bridge use.
            raw = sys.stdin.read(16385)
            if len(raw) > 16384:
                raise ValueError("Input is too large.")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("Expected a JSON object.")
            args.message = payload.get("message")
            if not isinstance(args.message, str) or len(args.message) > 2000:
                raise ValueError("Invalid message.")
        except (ValueError, TypeError):
            parser.exit(2, "Error: Invalid prediction input.\n")
    elif args.message is None:
        parser.error("Provide a message or --stdin-json.")
    try:
        result = predict_message(args.message)
    except Exception as error:
        if args.stdin_json:
            parser.exit(2, "Error: Prediction unavailable.\n")
        if isinstance(error, (ValueError, FileNotFoundError)):
            parser.exit(2, f"Error: {error}\n")
        raise
    if args.json or args.stdin_json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"Message: {args.message.strip()}")
        print(f"Category: {result['category']}")
        print(f"Confidence: {result['confidence']:.6f}")


if __name__ == "__main__":
    main()

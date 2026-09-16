"""Exercise the same stdin protocol used by the Node bridge in new processes."""
import json
import subprocess
import sys
import unittest

from ai.predict import MODEL_PATH


class PredictionProtocolTests(unittest.TestCase):
    def invoke(self, value):
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(MODEL_PATH.parent.parent / "predict.py"), "--stdin-json"],
            input=value, capture_output=True, text=True, encoding="utf-8", timeout=20,
        )

    def test_json_protocol_matches_saved_model(self):
        process = self.invoke(json.dumps({"message": "Where is my order?"}))
        self.assertEqual(process.returncode, 0, process.stderr)
        result = json.loads(process.stdout)
        report = json.loads((MODEL_PATH.parent.parent / "reports/evaluation.json").read_text())
        expected = report["sample_predictions"][0]
        self.assertEqual(result["category"], expected["category"])
        self.assertAlmostEqual(result["confidence"], expected["confidence"])

    def test_invalid_protocol_inputs_fail_without_tracebacks(self):
        for value in ["not json", "[]", "{}", '{"message":"   "}', json.dumps({"message": "x" * 2001}), "x" * 16385]:
            with self.subTest(input_length=len(value)):
                process = self.invoke(value)
                self.assertNotEqual(process.returncode, 0)
                self.assertEqual(process.stdout, "")
                self.assertNotIn("Traceback", process.stderr)
                self.assertNotIn(str(MODEL_PATH), process.stderr)


if __name__ == "__main__":
    unittest.main()

"""Test the supplied data and fitted artifact; fixtures never train a model."""
import hashlib
import json
import unittest
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score

from ai.predict import load_model, predict_message
from ai.train import AI_DIR, DATASET_PATH, clean_data, message_key, split_data


class ClassifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = pd.read_csv(DATASET_PATH, dtype=str, keep_default_na=False)
        cls.cleaned, cls.summary = clean_data(cls.raw)
        cls.train, cls.test, cls.split = split_data(cls.cleaned)
        cls.model = load_model()
        cls.report = json.loads((AI_DIR / "reports/evaluation.json").read_text(encoding="utf-8"))

    def test_original_csv_and_cleaning_counts(self):
        self.assertEqual(list(self.raw.columns), ["id", "message", "category"])
        self.assertEqual(len(self.raw), 450)
        self.assertEqual(self.summary["invalid_rows_removed"], 24)
        self.assertEqual(self.summary["total_duplicate_examples_removed"], 75)
        self.assertEqual(len(self.cleaned), 351)
        self.assertEqual(hashlib.sha256(DATASET_PATH.read_bytes()).hexdigest(), self.report["dataset_sha256"])

    def test_null_blank_trim_and_duplicate_handling(self):
        fixture = self.cleaned.head(7)[["id", "message", "category"]].copy()
        fixture.loc[0, "message"] = None
        fixture.loc[1, "message"] = "   "
        fixture.loc[2, "category"] = None
        fixture.loc[3, "category"] = "  "
        fixture.loc[4, "message"] = "  " + fixture.loc[4, "message"] + "  "
        fixture = pd.concat([fixture, fixture.iloc[[4]]])
        cleaned, summary = clean_data(fixture)
        self.assertEqual(summary["invalid_rows_removed"], 4)
        self.assertEqual(summary["total_duplicate_examples_removed"], 1)
        self.assertEqual(len(cleaned), 3)
        self.assertTrue(all(text == text.strip() for text in cleaned.message))

    def test_conflicting_labels_and_missing_columns_fail(self):
        fixture = self.cleaned.iloc[[0, 0]][["message", "category"]].copy()
        fixture.iloc[1, 1] = self.cleaned.loc[self.cleaned.category.ne(fixture.iloc[0].category), "category"].iloc[0]
        with self.assertRaisesRegex(ValueError, "conflicting"):
            clean_data(fixture)
        with self.assertRaisesRegex(ValueError, "columns"):
            clean_data(self.raw.drop(columns="message"))

    def test_split_stratification_reproducibility_and_no_duplicates(self):
        self.assertEqual((len(self.train), len(self.test)), (280, 71))
        self.assertTrue(self.split["stratified"])
        self.assertFalse(set(self.train.message_key) & set(self.test.message_key))
        self.assertEqual(set(self.train.category), set(self.test.category))
        train, test, _ = split_data(self.cleaned)
        self.assertEqual(list(self.train.source_record), list(train.source_record))
        self.assertEqual(list(self.test.source_record), list(test.source_record))

    def test_rare_category_retained_in_training_or_split_fails(self):
        label = self.cleaned.category.iloc[0]
        fixture = pd.concat([self.cleaned.loc[self.cleaned.category.ne(label)], self.cleaned.loc[self.cleaned.category.eq(label)].head(1)])
        train, test, info = split_data(fixture)
        self.assertIn(label, set(train.category))
        self.assertNotIn(label, set(test.category))
        self.assertTrue(info["notes"])
        with self.assertRaises(ValueError):
            split_data(self.cleaned.groupby("category").head(1))

    def test_vocabulary_was_fit_only_on_training_text(self):
        vectorizer = self.model.named_steps["tfidf"]
        analyzer = vectorizer.build_analyzer()
        train_features = {token for text in self.train.message for token in analyzer(text)}
        test_features = {token for text in self.test.message for token in analyzer(text)}
        self.assertTrue(test_features - train_features)
        self.assertFalse(set(vectorizer.vocabulary_) & (test_features - train_features))
        self.assertEqual(set(vectorizer.vocabulary_), train_features)

    def test_saved_model_reproduces_held_out_metrics(self):
        predictions = self.model.predict(self.test.message)
        self.assertAlmostEqual(accuracy_score(self.test.category, predictions), self.report["test_accuracy"])
        self.assertEqual(set(self.model.classes_), set(self.cleaned.category))
        path = AI_DIR / "models/customer_message_classifier.joblib"
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), self.report["model_sha256"])

    def test_predictions_return_actual_category_and_probability(self):
        for sample in self.report["sample_predictions"]:
            result = predict_message(sample["message"], self.model)
            predicted = self.model.predict([sample["message"]])[0]
            index = list(self.model.classes_).index(predicted)
            self.assertEqual(result["category"], predicted)
            self.assertIn(predicted, set(self.cleaned.category))
            self.assertTrue(0 <= result["confidence"] <= 1)
            self.assertAlmostEqual(result["confidence"], self.model.predict_proba([sample["message"]])[0][index])
            self.assertAlmostEqual(result["confidence"], sample["confidence"])

    def test_empty_invalid_input_and_missing_model(self):
        for value in ["", "   ", "\n\t", None, 123]:
            with self.assertRaises(ValueError):
                predict_message(value, self.model)
        with self.assertRaises(FileNotFoundError):
            load_model(Path("nonexistent-classifier-artifact.joblib"))

    def test_case_and_whitespace_equivalence(self):
        original = self.cleaned.message.iloc[0]
        self.assertEqual(message_key(original), message_key("  " + original.upper() + "  "))
        self.assertEqual(predict_message(original, self.model), predict_message("  " + original + "  ", self.model))


if __name__ == "__main__":
    unittest.main()

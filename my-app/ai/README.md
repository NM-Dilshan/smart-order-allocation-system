# Customer Message Classification ? AI Step 1

This document records the original AI Step 1 training baseline. It classifies customer messages into the supplied CSV's eight inquiry categories using TF-IDF and Logistic Regression. AI Step 2 now integrates the same saved model into customer support; see [INTEGRATION.md](INTEGRATION.md). The model, dataset, and training results below remain unchanged. No LLM or external inference service is used.

## Dataset inspection

Source: `ai/data/Customer_Message_Dataset.csv`, resolved relative to `train.py` via `Path(__file__)`, not an absolute Windows path. The original CSV is never overwritten.

- Columns: **id**, **message**, **category**.
- Original records: **450** (excluding header).
- Message feature: `message`; target: `category`; `id` is audit metadata only, never a feature.
- Empty/missing messages: **15**. Empty/missing labels: **10**. One row has both missing, so **24** distinct invalid rows are removed.
- Whitespace-only message/label cells: **0**. Missing IDs: **0**.
- CSV empty cells do not distinguish a database NULL from an empty string. The loader deliberately preserves literal strings such as `NA`; cleaning handles both pandas nulls and blank cells.
- Exact duplicate full rows including ID: **0**.
- Duplicate trimmed message/category examples among valid rows: **74** excess rows.
- One further case/spacing-equivalent model input is redundant. Total duplicate examples removed: **75**.
- Conflicting labels for identical model inputs: **0**. Tokenless nonblank messages: **0**.
- Final usable records: **351**.
- Original SHA-256: `39c8a72503ddd54b8f0435bb9bfd72d1c6695ad964bdebfe388821e8d3022aa1`.

Examples actually present in the CSV:

| ID | Message | Category |
| --- | --- | --- |
| 447 | Why is my promo code not working? | Missing ? removed |
| 277 | I cannot access my account | Account/Login Issue |
| 255 | Has the branch accepted my ORDER? | Order Status Inquiry |
| 84 | My order was marked delivered too early | Delivery Issue |

`reports/evaluation.json` contains the first eight source records, detailed missing-value/duplicate counts, parameters, versions, and evaluation results.

## Cleaning and leakage prevention

1. Read the supplied file only; do not create or augment training examples.
2. Trim surrounding whitespace on messages and labels; remove missing/blank messages or labels.
3. Use the vectorizer's stateless lowercase word tokenization as a duplicate key. This groups inputs that would produce identical word features despite case, whitespace, or punctuation-only differences; it does not learn a vocabulary or IDF from the full dataset.
4. Remove duplicate keys, keeping the first source record and its original trimmed message. No stemming, translation, spelling changes, or stop-word removal is used. IDs do not influence learning.
5. Fail clearly if equivalent inputs have conflicting labels; never guess a replacement category. Tokenless text is excluded and counted.
6. Split the deduplicated records before fitting TF-IDF or Logistic Regression. Verify zero duplicate-key overlap across partitions.

The tests use small copies of the supplied records to exercise missing/blank/conflicting-data handling. Those fixtures are never used for training or reported model evaluation.

## Categories and distribution

| Category | Original labeled | Cleaned | Train | Test |
| --- | ---: | ---: | ---: | ---: |
| Account/Login Issue | 55 | 46 | 37 | 9 |
| Delivery Issue | 55 | 46 | 37 | 9 |
| General Inquiry | 55 | 33 | 26 | 7 |
| Order Status Inquiry | 55 | 46 | 37 | 9 |
| Payment Issue | 55 | 45 | 36 | 9 |
| Product/Stock Inquiry | 55 | 45 | 36 | 9 |
| Promotion/Discount Inquiry | 55 | 46 | 36 | 10 |
| Refund/Cancellation | 55 | 44 | 35 | 9 |
| **Total** | **440** | **351** | **280** | **71** |

Ten original records have no label. Original category counts include records with missing messages. Cleaned largest/smallest class ratio is **1.394** (46/33): modest imbalance, with General Inquiry smaller than the other categories. No resampling or class weighting was applied.

## Split and model settings

- Approximately 80/20: **280 training**, **71 held-out test**, stratified across all eight categories, `random_state=42`. The test count is rounded up.
- `reports/split_manifest.csv` records each retained source record's one-based CSV data-record index, original ID, label, and partition for reproducibility.
- If a future dataset has singleton categories, keep them in training and stratify the remaining categories; explicitly report that their recall is not measurable. If a safe split is impossible, stop with an error rather than saving a misleading evaluation.
- TF-IDF: lowercase word unigrams and bigrams, `min_df=1`, `max_df=1.0`, `sublinear_tf=True`, no stop words or feature cap; default L2 normalization and smoothed IDF. The default token pattern keeps word tokens of at least two characters. Fitted vocabulary: **1320** features, learned only from training messages.
- Logistic Regression: `solver="lbfgs"`, `C=1.0`, default L2 regularization (`l1_ratio=0.0`), `max_iter=1000`, `tol=0.0001`, `class_weight=None`, `random_state=42`. No deprecated penalty option is passed. Convergence warnings cause training to fail rather than silently saving an unconverged model.
- Settings were selected as a simple baseline after inspecting the dataset. There was no test-set parameter search, tuning, or final refit on the full dataset. The saved model is exactly the pipeline evaluated on the held-out test set.

## Results

**Training accuracy: 1.000000 (100%).**

**Held-out test accuracy: 0.830986 (83.10%, 59/71 correct).**

| Held-out averaging | Precision | Recall | F1 |
| --- | ---: | ---: | ---: |
| Macro | 0.872946 | 0.818849 | 0.817037 |
| Weighted | 0.868595 | 0.830986 | 0.823715 |

Full per-category held-out classification report:

```text
HELD-OUT TEST PERFORMANCE
                            precision    recall  f1-score   support

       Account/Login Issue     0.9000    1.0000    0.9474         9
            Delivery Issue     1.0000    0.6667    0.8000         9
           General Inquiry     1.0000    0.4286    0.6000         7
      Order Status Inquiry     0.6154    0.8889    0.7273         9
             Payment Issue     0.9000    1.0000    0.9474         9
     Product/Stock Inquiry     0.7500    1.0000    0.8571         9
Promotion/Discount Inquiry     0.8182    0.9000    0.8571        10
       Refund/Cancellation     1.0000    0.6667    0.8000         9

                  accuracy                         0.8310        71
                 macro avg     0.8729    0.8188    0.8170        71
              weighted avg     0.8686    0.8310    0.8237        71
```

Readable held-out confusion matrix (actual category rows, predicted category columns):

```text
Held-out test confusion matrix: rows = actual; columns = predicted.

C1: Account/Login Issue
C2: Delivery Issue
C3: General Inquiry
C4: Order Status Inquiry
C5: Payment Issue
C6: Product/Stock Inquiry
C7: Promotion/Discount Inquiry
C8: Refund/Cancellation

       C1   C2   C3   C4   C5   C6   C7   C8
  C1    9    0    0    0    0    0    0    0
  C2    1    6    0    2    0    0    0    0
  C3    0    0    3    0    0    2    2    0
  C4    0    0    0    8    1    0    0    0
  C5    0    0    0    0    9    0    0    0
  C6    0    0    0    0    0    9    0    0
  C7    0    0    0    0    0    1    9    0
  C8    0    0    0    3    0    0    0    6
```

All misclassification directions:

- Refund/Cancellation ? Order Status Inquiry: 3
- Delivery Issue ? Order Status Inquiry: 2
- General Inquiry ? Product/Stock Inquiry: 2
- General Inquiry ? Promotion/Discount Inquiry: 2
- Delivery Issue ? Account/Login Issue: 1
- Order Status Inquiry ? Payment Issue: 1
- Promotion/Discount Inquiry ? Product/Stock Inquiry: 1

General Inquiry has the weakest recall (3/7 = 42.86%). Refund/Cancellation and Delivery Issue each have 66.67% recall. These categories need particular review before using this model to route real customer requests.

## Actual sample predictions

These were produced by `model.predict()` and `model.predict_proba()`, with probabilities matched to the predicted label's index in `model.classes_`. No outputs/confidences are hard-coded.

| Message | Predicted category | Confidence | Equivalent dataset input |
| --- | --- | ---: | --- |
| Where is my order? | Order Status Inquiry | 0.489530 | not in cleaned dataset |
| I cannot login to my account | Account/Login Issue | 0.686629 | not in cleaned dataset |
| Is this product available? | Product/Stock Inquiry | 0.436540 | not in cleaned dataset |
| My payment failed | Payment Issue | 0.524452 | not in cleaned dataset |
| I want to cancel my order | Refund/Cancellation | 0.407094 | training |
| Do you have any discounts today? | Promotion/Discount Inquiry | 0.330517 | not in cleaned dataset |

The cancellation example is already represented in the training partition; it is a demonstration, not unseen evaluation evidence. The other five have no equivalent token sequence in the cleaned dataset, but may resemble source phrasing. Sample messages were never appended to the training data or used to tune settings.

Confidence is the model's actual probability, between 0 and 1; it is not a calibrated guarantee of correctness. No low-confidence label or threshold is invented. Every nonempty input receives one of the original eight labels, including out-of-domain or unknown-vocabulary input. A later integration must decide how to handle low confidence and unsupported topics.

## Artifacts and dependencies

- `models/customer_message_classifier.joblib`: complete fitted TF-IDF + Logistic Regression Pipeline (59,856 bytes in this run).
- `reports/evaluation.json`: source/model hashes, cleaning/split summary, exact parameters, library versions, scores, confusion matrix, and sample outputs.
- `reports/classification_report.txt`: per-class held-out metrics.
- `reports/confusion_matrix.txt` and `.csv`: readable matrix and full category headers.
- `reports/split_manifest.csv`: retained source records and split assignment.
- `train.py`, `predict.py`, `tests/test_classifier.py`, `requirements.txt`, `.gitignore`, this README.

Required direct packages: **pandas 3.0.5**, **scikit-learn 1.9.0**, **joblib 1.5.3**, pinned in `requirements.txt`. They were already installed; no package installation or Next.js dependency change was needed. The run used Python 3.14.7, NumPy 2.5.2, and SciPy 1.18.1. NumPy/SciPy are transitive dependencies. Matplotlib is unnecessary because the matrix is supplied as readable text and CSV.

Only load trusted joblib files. Keep the training and loading environments compatible; loading across scikit-learn versions is unsupported. See the [official model persistence guidance](https://scikit-learn.org/stable/model_persistence.html), [TF-IDF reference](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html), and [Logistic Regression reference](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html).

## Windows PowerShell commands

From the `my-app` project directory, use a local environment inside `ai` (ignored by `ai/.gitignore`). Explicit interpreter paths avoid PowerShell activation-policy issues:

```powershell
python -m venv ai\.venv
.\ai\.venv\Scripts\python.exe -m pip install -r ai\requirements.txt
.\ai\.venv\Scripts\python.exe ai\train.py
.\ai\.venv\Scripts\python.exe ai\predict.py "Where is my order?"
.\ai\.venv\Scripts\python.exe ai\predict.py "My payment failed" --json
.\ai\.venv\Scripts\python.exe -m unittest discover -s ai\tests -v
```

If dependencies are already installed for `python`, use:

```powershell
python ai\train.py
python ai\predict.py "Where is my order?"
python -m unittest discover -s ai\tests -v
python ai\predict.py "   "  # Expected failure: nonempty message required
```

`predict.py` loads the saved pipeline without fitting anything. Its reusable function is `predict_message(message, model=None)`; passing an already loaded pipeline permits reuse across local calls. `--json` prints only the category and actual confidence. Training resolves paths independently of the shell's working directory and regenerates reports; README numbers describe the supplied CSV/run recorded here.

## Verification and limitations

- The original CSV loaded successfully and its SHA-256 stayed unchanged.
- Ten automated Python tests pass: cleaning edge cases, label conflicts, rare classes, reproducible/disjoint splits, training-only vocabulary, saved-model metric reproduction, known labels, actual probabilities, and invalid input handling.
- A separate Python CLI process loaded the persisted pipeline and returned `Order Status Inquiry` with confidence `0.48953044144599595` for `Where is my order?`.
- A separate blank-input invocation failed safely before loading the model.
- No Next.js/business files were changed by this step; source hashes were compared before and after. Existing application changes from earlier work were preserved.
- Joblib 1.5.3 emits a NumPy 2.5 array-shape **DeprecationWarning** when the test runner enables warnings while loading. Loading and all tests succeed; warnings were not suppressed. No convergence warning occurred.
- 351 cleaned examples and only 71 held-out examples are a small baseline. Training 100% vs test 83.10% indicates an optimism/overfitting risk; do not claim production generalization from training accuracy.
- Near-duplicate/template-like messages may remain across the random split even though identical model inputs are disjoint. The dataset has no trustworthy conversation/customer/time grouping, so independent real-world data is still needed for validation. No provenance or generation-method claim is made about the supplied CSV.
- This is English word-based classification. Typos, multilingual text, multiple intents, unusual phrasing, and unseen topics are not validated. Probability calibration and low-confidence routing are out of scope.
- The supplied CSV, reports, and model remain visible to Git; only Python bytecode and local environments are ignored. The dataset's public redistribution/license permission was not supplied, so confirm that separately before publishing it. Nothing was committed or uploaded.

The completed AI Step 2 integration is documented in [INTEGRATION.md](INTEGRATION.md); it does not retrain or alter this baseline.

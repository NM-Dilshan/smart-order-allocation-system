# AI Step 2: Customer Support integration

> Historical Step 2 implementation report. The subprocess architecture and deployment instructions below have been superseded by [VERCEL.md](VERCEL.md). Current inquiry inference uses a native Python HTTP function; authentication and persistence behavior remain unchanged.

The existing trained Pipeline is now used to classify and save customer inquiries. Its model file, dataset, training script, vocabulary, and weights are unchanged. No retraining, JavaScript keyword classification, external AI service, automatic order action, or allocation change was added.

## Pages, APIs, and permissions

| Route | Purpose | Authorization |
| --- | --- | --- |
| `/support` | Customer form and own inquiry history | CUSTOMER; visitors redirect to `/login`, management to `/admin/inquiries` |
| `POST /api/inquiries` | Validate, classify, then save | CUSTOMER, with the existing origin check |
| `GET /api/my-inquiries` | Latest 100 inquiries belonging to the session user | CUSTOMER; database `where: { userId: user.id }` |
| `/admin/inquiries` | Customer, message, predicted category, confidence, date | Existing ManagementAccess: ADMIN/STAFF |
| `GET /api/inquiries` | Latest 100 inquiries for management | Existing withManagement: ADMIN/STAFF |

API guests receive 401. Wrong roles receive 403. Customer history is queried by session user ID, never fetched globally and filtered on the client. A query/body userId does not change ownership. Exact user selections include name/email only for management; password hashes and other user fields are never returned.

The customer form trims input, rejects blank text, limits messages to 2000 UTF-16 code units, disables controls during submission, and uses a synchronous pending ref to block concurrent double-click/Enter submissions. Errors retain the typed text. Success displays the stored category and refreshes history. Confidence is not shown or returned in customer responses. History and management lists have explicit 100-entry limits, displayed in their UIs; pagination is outside this assessment step.

Navigation adds Customer Support for CUSTOMER, and Customer Inquiries for ADMIN/STAFF. Authorization remains on pages and APIs, independent of links.

## Database

Added Prisma model:

```prisma
model CustomerInquiry {
  id                Int      @id @default(autoincrement())
  userId            Int
  message           String
  predictedCategory String
  confidence        Float
  createdAt         DateTime @default(now())
  user              User     @relation(fields: [userId], references: [id])

  @@index([userId, id])
}
```

`User.inquiries` is the inverse relation. Migration `20260916000200_add_customer_inquiry` creates only the inquiry table, primary key, ownership index, and foreign key. It was applied successfully to the configured database with `prisma migrate deploy`. Prisma Client was regenerated.

No passwords, vectors, model internals, order links, or duplicated customer profile data are stored. Confidence uses PostgreSQL DOUBLE PRECISION (Prisma Float) and is saved directly from the parsed model result without rounding. Management rounds only the displayed percentage to two decimal places.

## Local integration architecture

1. `POST /api/inquiries` uses the existing `withCustomer` guard and validates the request.
2. Server-only `lib/ai-classifier.ts` launches the configured Python executable using Node `execFile` with a fixed argument array, `shell: false`, and `windowsHide: true`.
3. The customer message is serialized as JSON and written through standard input. It is never interpolated into a command string or passed as a process argument. Quotes, shell syntax, leading dashes, newlines, and Unicode remain data.
4. `python -X utf8 ai/predict.py --stdin-json` reads bounded JSON, then calls the existing `predict_message`, `model.predict`, and `model.predict_proba` against the original saved joblib Pipeline.
5. Python returns only the JSON prediction on stdout. The bridge never scrapes console prose. Existing quoted-message CLI and `--json` mode still work.
6. Node parses the JSON and validates the label against the eight actual model categories and confidence as a finite number in `[0, 1]`.
7. Only after successful prediction does one atomic Prisma create save the inquiry with the authenticated customer's ID. No pending or partial inquiry is inserted before classification.

Actual prediction for `Where is my order?`:

```json
{
  "category": "Order Status Inquiry",
  "confidence": 0.48953044144599595
}
```

Allowed labels: Account/Login Issue; Delivery Issue; General Inquiry; Order Status Inquiry; Payment Issue; Product/Stock Inquiry; Promotion/Discount Inquiry; Refund/Cancellation. This list only validates Python output; it does not decide a category.

Low confidence is preserved and accepted. Probabilities are uncalibrated supporting information, not guaranteed correctness. No fallback category or fake probability is created.

## Failure handling

- Invalid JSON, wrong message type, blank or overlong input: 400, no prediction or insert.
- Unauthenticated/wrong role/foreign origin: existing 401/403 behavior, no prediction or insert.
- Missing Python/model, prediction failure, nonzero exit, malformed output, unknown label, invalid confidence, or timeout: sanitized 503, no insert.
- Child timeout: 20 seconds; terminate with SIGKILL. stdout/stderr maximum buffer: 16 KiB. stdin JSON is bounded independently in Python.
- Database create failure: sanitized 500.
- Management/history database failures are sanitized by existing authorization wrappers.

No Python traceback, process stderr, filesystem path, Prisma internals, database URL, authentication secret, or password hash is included in an API error. Normal CLI diagnostic behavior is preserved; the new machine protocol uses generic errors. Child execution inherits the trusted server environment; no environment data is sent to the browser.

## Preserved behavior

No JWT or alternate authentication system was added. iron-session, secure cookies, scrypt, live database role checks, customer ownership, and existing cancellation authorization remain intact.

Inquiry classification does not read or mutate orders, branches, allocation metrics, or inventory. A message asking to cancel an order is only saved as an inquiry. The existing explicit management cancellation flow remains responsible for cancellation/restoration. Complete-order stock eligibility, Haversine distance, ALLOCATED workload, normalization, 0.7/0.3 scoring, deterministic branch choice, transactional deduction, and cancellation protections remain unchanged.

The saved model SHA-256 is unchanged:
`c5175ba2d7d26f69eed9d21d4532074833a0a7e06b5fcde1566813431deba634`.

## Setup and deployment

From `my-app` in PowerShell (no retraining required):

```powershell
python -m venv ai\.venv
.\ai\.venv\Scripts\python.exe -m pip install -r ai\requirements.txt
node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts
node node_modules/prisma/build/index.js generate --config prisma7.config.ts
npm run dev
```

Python selection: nonblank `PYTHON_EXECUTABLE` environment value first, then `ai/.venv/Scripts/python.exe` on Windows or `ai/.venv/bin/python` elsewhere, then `python` from PATH. Set PYTHON_EXECUTABLE to a trusted executable path, not a command plus arguments. Restart the server after changing it. `.env.example` documents the optional setting. Existing AUTH_SECRET/AUTH_ORIGIN settings remain required; use `http://localhost:3000` for the configured local origin.

This run used the existing Python installation and existing requirements. No new Python/npm dependencies were added. The original model is already present, so `train.py` must not be run as part of deployment or request handling.

The API explicitly uses the Node.js runtime. `next.config.ts` traces `ai/predict.py` and the saved model for the inquiry route. That does not install Python or its packages. Run Next.js with the application root as its working directory and ensure these files and the matching Python environment are deployed there.

A serverless or Edge platform may lack Python, disallow child processes, omit model files, or impose shorter execution limits. This integration is for the local assessment / a Node host that permits Python children. Each inquiry starts a process and loads the small model, so it is not optimized for high traffic. A production deployment could move inference behind a separately hosted Python service if needed; no service/microservice redesign was implemented here.

## Verification

- **30 application tests passed**, including existing authentication, customer ownership, allocation, stock deduction, cancellation, and form tests, plus real-classifier integration, malformed-output/error cases, role restrictions, and duplicate-submit handling.
- **12 Python tests passed**: the original 10 plus subprocess JSON-protocol and invalid-input tests.
- TypeScript, targeted ESLint, and Prisma schema validation passed.
- Real classifier tests compare the bridge output with the original recorded model predictions and do not substitute keyword rules.
- Live HTTP/database verification: CUSTOMER submitted both an order-status and a cancellation-style message; exact model categories/probabilities were stored under that session's user ID despite a forged userId/category/confidence in the request.
- Live verification rejected blank/overlong messages and guest submissions, blocked customer management listing, isolated another customer's history, allowed STAFF and ADMIN listing, and blocked management submission through the customer API.
- Protected `/support` and `/admin/inquiries` pages returned the expected authenticated responses and unauthenticated redirects.
- Live order and inventory table fingerprints were identical before/after those inquiry submissions. Temporary accounts/inquiries were deleted after verification; existing application data was preserved.
- Source hashes confirmed no changes to the trained model, CSV, training script, allocation/stock/cancellation logic, authentication/session logic, order routes, or dependency manifests.

Test commands:

```powershell
python -m unittest discover -s ai\tests -v
node -e "for (const f of require('node:fs').readdirSync('./tests').filter(f=>f.endsWith('.test.mjs'))) import('./tests/'+f)"
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js lib/ai-classifier.ts lib/inquiries.ts app/api/inquiries app/api/my-inquiries app/support app/admin/inquiries app/auth-controls.tsx next.config.ts tests/inquiries.test.mjs tests/support-form.test.mjs
```

The environment initially blocked Prisma's schema engine and Node-to-Python process launches with EPERM. Migration and subprocess tests passed after running with process-launch permission. This was an execution-environment restriction, not a suppressed test failure. Existing joblib/NumPy deprecation warnings remain visible in Python tests; loading and all tests pass. Prisma displayed an optional upgrade notice; no dependency upgrade was made.

Actual browser click-through/visual verification was not performed. Live checks used HTTP requests, real database records, real sessions and the real Python model; form tests exercised component handlers. Use the checklist below for manual browser review.

## Manual browser checklist

- [ ] Sign in as CUSTOMER and open Customer Support from navigation.
- [ ] Submit `Where is my order?`; confirm success/category and the new history item, without a confidence banner.
- [ ] Try blank, whitespace-only, and overlong input; confirm useful errors and no saved inquiry.
- [ ] Double-click Submit / press Enter repeatedly during prediction; confirm one submission.
- [ ] Sign in as another customer; confirm inquiry histories are isolated.
- [ ] Sign in as STAFF and ADMIN; confirm Customer Inquiries shows customer, message, category, percentage, and timestamp.
- [ ] Try management page/API as a customer and private APIs logged out; confirm redirects/403/401.
- [ ] Submit a cancellation-style message; confirm no order status or stock changes.
- [ ] In a disposable local configuration, use an invalid PYTHON_EXECUTABLE; confirm sanitized failure and retained form text, then restore configuration.
- [ ] Check keyboard focus, mobile wrapping, long messages, loading/empty/error states, and Refresh behavior.

## Exact Step 2 file manifest

Paths below are relative to `my-app`; earlier unrelated work is not part of this manifest.

Created:

```text
ai/INTEGRATION.md
ai/tests/test_predict_protocol.py
lib/ai-classifier.ts
lib/inquiries.ts
app/api/inquiries/route.ts
app/api/my-inquiries/route.ts
app/support/page.tsx
app/support/support-form.tsx
app/admin/inquiries/page.tsx
app/admin/inquiries/inquiry-manager.tsx
prisma/migrations/20260916000200_add_customer_inquiry/migration.sql
tests/inquiries.test.mjs
tests/support-form.test.mjs
app/generated/prisma/models/CustomerInquiry.ts
```

Modified:

```text
.env.example
AUTHENTICATION.md
ai/README.md
ai/predict.py
app/auth-controls.tsx
next.config.ts
prisma/schema.prisma
app/generated/prisma/browser.ts
app/generated/prisma/client.ts
app/generated/prisma/internal/class.ts
app/generated/prisma/internal/prismaNamespace.ts
app/generated/prisma/internal/prismaNamespaceBrowser.ts
app/generated/prisma/models.ts
app/generated/prisma/models/User.ts
```

The generated files were refreshed for the new model; no existing business model fields or runtime business logic were changed. Step 2 stops at classification, persistence, and authorized inquiry viewing.

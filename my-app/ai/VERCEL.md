# Customer inquiry inference on Vercel

## Verified missing-route cause

The production deployment `dpl_HhukLgyA74A89WGUNyxNJDWurRq9` was inspected through its build logs and `/v6/deployments/{id}/files` listing. Its uploaded `src` tree has no `api/classify_inquiry.py`, root `requirements.txt`, `.python-version`, `vercel.json`, or `.vercelignore`, and its output has no classifier function. Its manifest does contain `.env` (contents were not read). This is an incomplete/stale source deployment, not evidence of an `app/api` versus root `api` routing conflict. The current local source tree detects the Python builder with the existing Next.js preset. The mechanism that omitted those files from the previous upload is not known; redeploying the old deployment would reuse the wrong source.

No broad rewrite, legacy `builds` override or output directory override is needed. Preserve the existing `vercel.json`: `framework: nextjs` and the single `functions["api/classify_inquiry.py"]` packaging/duration configuration. Run deployment commands from `my-app`, not the parent repository. If deploying through Git, include all new inference files in the commit and configure `my-app` as the project Root Directory. CLI deployment from `my-app` uses it as the upload root.

Python 3.14 is explicitly supported by the current [Vercel Python runtime documentation](https://vercel.com/docs/functions/runtimes/python#python-version); it is not selected only because it is installed locally.

The browser still calls authenticated `POST /api/inquiries`. Its server-only bridge now sends JSON to `POST /api/classify_inquiry`, a native Python function. No Node child process is used. Python calls the unchanged `ai/predict.py` implementation and original saved pipeline, cached per warm Python instance. Both runtimes validate the eight labels and finite confidence in [0, 1]. Only successful classification is saved under the session customer's ID.

## Production setup

Use `my-app` as the Vercel project root. Keep the existing database and authentication settings unchanged.

1. Set a new, strong random `INQUIRY_CLASSIFIER_SECRET` in Vercel environment settings for each desired environment. Both functions receive the same server-only value. Never use a `NEXT_PUBLIC_` prefix. The Python endpoint requires this bearer token; it does not replace the customer session guard on the inquiry API.
2. Normally leave `INQUIRY_CLASSIFIER_URL` unset. The bridge calls `https://${VERCEL_URL}/api/classify_inquiry`, so previews use their own deployment. An explicit server-only HTTPS URL is supported if needed.
3. If Deployment Protection protects that deployment URL, enable Protection Bypass for Automation so Vercel supplies `VERCEL_AUTOMATION_BYPASS_SECRET`. The bridge sends its bypass header only to the current `VERCEL_URL` host. The separate classifier bearer token remains required. Without a valid bypass, protected deployments can return 401 to the bridge and result in a safe 503.
4. Redeploy manually after configuring the environment. This change does not deploy automatically or alter Vercel project settings.

Root `requirements.txt` pins scikit-learn 1.9.0 and joblib 1.5.3, matching the existing environment. `.python-version` selects Python 3.14. pandas is not needed by the saved TF-IDF/logistic-regression pipeline, so it remains only in the existing training requirements. No training command runs during build or inference.

`vercel.json` preserves Next.js detection and configures the Python function's 30-second limit and packaging exclusions. Python packaging retains `ai/predict.py` and `ai/models/customer_message_classifier.joblib`. `.vercelignore` excludes environment files, local environments, tests, training data and reports. Next.js no longer traces Python assets into its Node function.

Official reference: [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python).

## Local development

From `my-app`, install runtime dependencies and start Python in one terminal:

```powershell
python -m pip install -r requirements.txt
python -m api.classify_inquiry
```

In another terminal run `npm run dev` and open `/support` on the displayed Next.js URL. The bridge defaults to `http://127.0.0.1:8001/api/classify_inquiry`. Python binds only to loopback locally. No secret is required for local loopback development when unset in both runtimes. If configured, provide the same `INQUIRY_CLASSIFIER_SECRET` to both terminal environments; the standalone Python server does not read Next.js `.env` files. A custom local port can be supplied with `--port` and the matching server-only `INQUIRY_CLASSIFIER_URL`.

Stop the Python server with Ctrl+C. Existing prediction CLI commands remain available. `PYTHON_EXECUTABLE` is no longer an application setting; tests may use it to select their Python fixture executable.

## Failure behavior

The bridge times out after 25 seconds; the inquiry route allows 60 seconds. Invalid messages return 400. Missing configuration, network/protection failures, invalid model output and inference errors produce the existing safe 503 without inserting an inquiry. Logs contain only a failure phase, HTTP status or Python exception type, never customer text, tokens or tracebacks. Unauthenticated direct Python requests return 401; unsupported methods return 405.

## Verification and limits

```powershell
python -m unittest discover -s ai/tests -v
node -e "for (const f of require('node:fs').readdirSync('./tests').filter(f=>f.endsWith('.test.mjs'))) import('./tests/'+f)"
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js lib/ai-classifier.ts app/api/inquiries/route.ts next.config.ts tests/inquiries.test.mjs
npm run build
vercel deploy --dry --format=json
```

Tests use the actual saved model through local HTTP and cover validation, invalid predictions, inference failures, authorization, ownership and no database writes before successful classification. The real model returns `Order Status Inquiry` with confidence `0.48953044144599595` for `Where is my order?`; there is no hard-coded prediction fallback.

The dry run checks framework detection and source packaging only. It does not build the Linux Python dependency bundle or exercise a deployed function. Deployment environment configuration, final Python bundle size/cold-start behavior and live authenticated persistence must be verified after a manual deployment. Existing joblib/NumPy deprecation warnings do not prevent local inference. No schema migration is required.

Routing-fix verification: 63 application tests, 18 Python tests, targeted ESLint and `npm run build` (including TypeScript) passed. The guarded dry run passed. A local `vercel build` generated `.vercel/output/functions/api/classify_inquiry.func/.vc-config.json` with runtime `python3.14`, the Python handler, 30-second duration, and mappings for the endpoint, predictor, model and requirements, with no environment-file mapping. However, the combined build failed on a Windows symlink permission error while emitting a Next.js function. This is partial build-output evidence, not a successful Vercel build or production verification. Do not deploy that partial output with `--prebuilt`.

## Deploy and verify manually

First configure `INQUIRY_CLASSIFIER_SECRET` in the Vercel Production environment using the dashboard or `vercel env add INQUIRY_CLASSIFIER_SECRET production`. Keep existing database/auth variables unchanged. Configure the automation bypass if Deployment Protection applies to the deployment hostname used internally by the bridge.

Run these PowerShell commands from the complete working tree:

```powershell
Set-Location 'E:\my portfolio\smart-order-allocation-system\my-app'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
vercel deploy --dry --format=json | node scripts/verify-inquiry-deployment.mjs
if ($LASTEXITCODE -ne 0) { throw 'Deployment preflight failed' }
vercel deploy --prod
```

Do not use `vercel redeploy` on the older deployment or `--prebuilt` with an incomplete local output. Confirm the new deployment build logs contain the Python build and its Functions list includes `api/classify_inquiry`.

After deployment, with the existing classifier secret available in the current PowerShell environment (do not paste its value into source/history):

```powershell
$base = 'https://smart-order-allocation-app.vercel.app'
curl.exe -i "$base/api/classify_inquiry"
# Expected 405 JSON, not Next.js HTML 404.
if (-not $env:INQUIRY_CLASSIFIER_SECRET) { throw 'Set the existing classifier secret in this shell first' }
$headers = @{ Authorization = "Bearer $env:INQUIRY_CLASSIFIER_SECRET" }
if ($env:VERCEL_AUTOMATION_BYPASS_SECRET) {
  $headers['x-vercel-protection-bypass'] = $env:VERCEL_AUTOMATION_BYPASS_SECRET
}
Invoke-RestMethod -Method Post -Uri "$base/api/classify_inquiry" -Headers $headers -ContentType 'application/json' -Body (@{ message = 'Where is my order?' } | ConvertTo-Json)
# Expected actual category and confidence. Missing/wrong bearer token: 401.
```

If Deployment Protection blocks the GET probe, repeat it with `Invoke-WebRequest` and the bypass header; an edge protection response is not the Python handler response. Then sign in at `/support`, submit the message and verify history and management visibility. The direct Python test does not insert a database record.

Diagnostics distinguish `endpoint-not-found` (404), `endpoint-unauthorized` (401/403), `upstream-server-error` (5xx), `timeout`, `malformed-json` and `invalid-prediction`. The customer-facing response stays the same safe 503. No response bodies, customer messages or secrets are logged.

Manual verification after deployment:

- Sign in as CUSTOMER; submit `Where is my order?` at `/support` and confirm saved category/history.
- Check the exact saved probability in management and confirm another customer cannot see the inquiry.
- Reject blank or malformed requests; reject unauthenticated customer API access and direct Python calls without the bearer token.
- In an isolated preview, deliberately misconfigure the classifier URL and confirm safe 503, retained form text and no inserted inquiry; then restore it.
- Confirm orders, inventory, management replies and authentication remain unchanged.

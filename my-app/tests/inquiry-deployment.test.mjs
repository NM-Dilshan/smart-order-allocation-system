import test from "node:test";
import assert from "node:assert/strict";
import { verifyManifest } from "../scripts/verify-inquiry-deployment.mjs";

test("deployment preflight requires inference sources and excludes environment files", () => {
  const paths = ["api/classify_inquiry.py", "ai/predict.py", "ai/models/customer_message_classifier.joblib", "requirements.txt", ".python-version", "vercel.json", ".vercelignore", "app/api/inquiries/route.ts", "lib/ai-classifier.ts"];
  const manifest = (files) => ({ framework: { slug: "nextjs" }, files: files.map(path => ({ path })) });
  assert.doesNotThrow(() => verifyManifest(manifest(paths)));
  assert.doesNotThrow(() => verifyManifest(manifest(paths.map(p => p.replaceAll("/", "\\")))));
  for (const missing of paths) assert.throws(() => verifyManifest(manifest(paths.filter(p => p !== missing))), /missing/);
  for (const secret of [".env", ".env.local", "nested/.env.production"]) assert.throws(() => verifyManifest(manifest([...paths, secret])), /must not be uploaded/);
  assert.throws(() => verifyManifest({ ...manifest(paths), framework: { slug: "other" } }), /Next.js/);
});

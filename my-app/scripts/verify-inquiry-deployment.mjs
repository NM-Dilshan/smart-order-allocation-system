import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function verifyManifest(manifest) {
  if (manifest.framework?.slug !== "nextjs") throw new Error("Expected the Next.js framework preset.");
  const files = new Set(manifest.files.map(({ path }) => path.replaceAll("\\", "/")));
  for (const path of ["api/classify_inquiry.py", "ai/predict.py", "ai/models/customer_message_classifier.joblib", "requirements.txt", ".python-version", "vercel.json", ".vercelignore", "app/api/inquiries/route.ts", "lib/ai-classifier.ts"]) {
    if (!files.has(path)) throw new Error(`Deployment is missing ${path}. Run from my-app with the complete source tree.`);
  }
  for (const path of files) {
    if (/(^|\/)\.env($|\.)/.test(path)) throw new Error(`Environment file must not be uploaded: ${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyManifest(JSON.parse(fs.readFileSync(0, "utf8")));
    console.log("PASS: Next.js, Python endpoint, model and runtime configuration included; environment files excluded.");
    console.log("This checks source packaging, not a built or deployed function.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

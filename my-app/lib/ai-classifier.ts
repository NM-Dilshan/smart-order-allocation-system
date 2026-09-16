import "server-only";
import { validateInquiryMessage } from "@/lib/inquiries";

// Exact labels from the existing fitted pipeline, not classification rules.
export const INQUIRY_CATEGORIES = [
  "Account/Login Issue", "Delivery Issue", "General Inquiry", "Order Status Inquiry",
  "Payment Issue", "Product/Stock Inquiry", "Promotion/Discount Inquiry", "Refund/Cancellation",
] as const;
export type Prediction = { category: typeof INQUIRY_CATEGORIES[number]; confidence: number };
export class ClassifierUnavailableError extends Error {
  constructor(readonly reason = "unavailable") { super("Classification is temporarily unavailable. Please try again."); }
}

export function parsePrediction(output: string): Prediction {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch { throw new ClassifierUnavailableError("malformed-json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ClassifierUnavailableError("invalid-prediction");
  const { category, confidence } = value as Record<string, unknown>;
  if (typeof category !== "string" || !(INQUIRY_CATEGORIES as readonly string[]).includes(category) ||
      typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new ClassifierUnavailableError("invalid-prediction");
  return { category: category as Prediction["category"], confidence };
}

export async function classifyInquiry(value: string): Promise<Prediction> {
  const message = validateInquiryMessage(value);
  if (!message) throw new ClassifierUnavailableError();
  let phase = "configuration";
  try {
    const deploymentHost = process.env.VERCEL_URL;
    const endpoint = new URL(process.env.INQUIRY_CLASSIFIER_URL?.trim() || (process.env.VERCEL === "1"
      ? `https://${deploymentHost}/api/classify_inquiry`
      : "http://127.0.0.1:8001/api/classify_inquiry"));
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || (endpoint.protocol !== "https:" && !(local && process.env.VERCEL !== "1" && endpoint.protocol === "http:"))) throw new Error();
    const secret = process.env.INQUIRY_CLASSIFIER_SECRET?.trim();
    if (process.env.VERCEL === "1" && (!secret || (!process.env.INQUIRY_CLASSIFIER_URL && !deploymentHost))) throw new Error();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers.Authorization = `Bearer ${secret}`;
    if (endpoint.hostname === deploymentHost && process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    phase = "request";
    const response = await fetch(endpoint, {
      method: "POST", headers, body: JSON.stringify({ message }), cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const reason = response.status === 404 ? "endpoint-not-found" :
        [401, 403].includes(response.status) ? "endpoint-unauthorized" :
        response.status >= 500 ? "upstream-server-error" : "upstream-http-error";
      console.error("[inquiry-classifier] Upstream HTTP failure", { status: response.status, reason });
      throw new ClassifierUnavailableError(reason);
    }
    phase = "response-validation";
    const output = await response.text();
    if (output.length > 16384) throw new ClassifierUnavailableError("response-too-large");
    return parsePrediction(output);
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? error.name : null;
    const reason = error instanceof ClassifierUnavailableError ? error.reason :
      name === "TimeoutError" || name === "AbortError" ? "timeout" :
      phase === "configuration" ? "configuration" : "network-error";
    console.error("[inquiry-classifier] Classification failed", { phase, reason });
    throw new ClassifierUnavailableError();
  }
}

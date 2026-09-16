import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { validateInquiryMessage } from "@/lib/inquiries";

// Exact labels from the existing fitted pipeline, not classification rules.
export const INQUIRY_CATEGORIES = [
  "Account/Login Issue", "Delivery Issue", "General Inquiry", "Order Status Inquiry",
  "Payment Issue", "Product/Stock Inquiry", "Promotion/Discount Inquiry", "Refund/Cancellation",
] as const;
export type Prediction = { category: typeof INQUIRY_CATEGORIES[number]; confidence: number };
export class ClassifierUnavailableError extends Error {
  constructor() { super("Classification is temporarily unavailable. Please try again."); }
}

export function parsePrediction(output: string): Prediction {
  try {
    const value: unknown = JSON.parse(output);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const { category, confidence } = value as Record<string, unknown>;
    if (typeof category !== "string" || !(INQUIRY_CATEGORIES as readonly string[]).includes(category) ||
        typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error();
    return { category: category as Prediction["category"], confidence };
  } catch { throw new ClassifierUnavailableError(); }
}

export async function classifyInquiry(value: string): Promise<Prediction> {
  const message = validateInquiryMessage(value);
  if (!message) throw new ClassifierUnavailableError();
  const aiDirectory = path.join(process.cwd(), "ai");
  const localPython = path.join(aiDirectory, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const executable = process.env.PYTHON_EXECUTABLE?.trim() || (existsSync(localPython) ? localPython : "python");
  return new Promise((resolve, reject) => {
    try {
      // Customer text is stdin data, never an executable, shell string, or argument.
      const child = execFile(executable, ["-X", "utf8", path.join(aiDirectory, "predict.py"), "--stdin-json"], {
        shell: false, windowsHide: true, timeout: 20000, killSignal: "SIGKILL",
        maxBuffer: 16384, encoding: "utf8",
      }, (error, stdout) => {
        if (error) { reject(new ClassifierUnavailableError()); return; }
        try { resolve(parsePrediction(stdout)); } catch { reject(new ClassifierUnavailableError()); }
      });
      // An early Python exit may close stdin. The execFile callback handles its failure.
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify({ message }));
    } catch { reject(new ClassifierUnavailableError()); }
  });
}

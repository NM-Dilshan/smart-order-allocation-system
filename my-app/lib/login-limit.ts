import { createHash } from "node:crypto";

const attempts = new Map<string, { count: number; expires: number }>();
const WINDOW_MS = 15 * 60 * 1000;

export function allowLogin(email: string, now = Date.now()) {
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = createHash("sha256").update(email).digest("hex");
  const entry = attempts.get(key);
  if (entry && entry.count >= 5) return false;
  if (!entry && attempts.size >= 1000) return false;
  attempts.set(key, { count: (entry?.count ?? 0) + 1, expires: entry?.expires ?? now + WINDOW_MS });
  return true;
}

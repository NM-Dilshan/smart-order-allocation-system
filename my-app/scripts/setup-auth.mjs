import { existsSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { hashPassword } from "../lib/passwords.mjs";

if (existsSync(".env")) process.loadEnvFile(".env");
const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_PASSWORD;
const name = process.env.BOOTSTRAP_NAME?.trim() || "Administrator";
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith("@smart-order.invalid") || !password || password.length < 12 || password.length > 256) {
  console.error("Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD (12-256 characters). BOOTSTRAP_NAME is optional.");
  process.exit(1);
}
if (!process.env.AUTH_SECRET) appendFileSync(".env", `\nAUTH_SECRET=${randomBytes(48).toString("hex")}\n`, { mode: 0o600 });
if (!process.env.AUTH_ORIGIN) appendFileSync(".env", "\nAUTH_ORIGIN=http://localhost:3000\n", { mode: 0o600 });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const hash = await hashPassword(password);
  await client.query('INSERT INTO "User" (name, email, password, role) VALUES ($1, $2, $3, \'ADMIN\') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password, role = EXCLUDED.role', [name, email, hash]);
  console.log("Management account provisioned. Restart the development server if authentication settings were added.");
} catch {
  console.error("Unable to provision the account. Check database connectivity and apply the role migration first.");
  process.exitCode = 1;
} finally { await client.end(); }

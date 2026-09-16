import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** @param {string} password */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = /** @type {Buffer} */ (await scrypt(password, salt, 64, OPTIONS));
  return `scrypt$${salt}$${key.toString("hex")}`;
}

/** @param {string} password @param {string} encoded */
export async function verifyPassword(password, encoded) {
  const parts = encoded.split("$");
  const valid = parts.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Perform the same expensive operation for unknown users and unsupported legacy passwords.
  const salt = valid ? parts[1] : "0".repeat(32);
  const expected = valid ? Buffer.from(parts[2], "hex") : Buffer.alloc(64);
  const actual = /** @type {Buffer} */ (await scrypt(password, salt, 64, OPTIONS));
  return timingSafeEqual(actual, expected) && valid;
}

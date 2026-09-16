import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import { getIronSession } from "iron-session";
import { hashPassword, verifyPassword } from "../lib/passwords.mjs";

function load(path, dependencies, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, { exports, Request, process: { env }, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  return exports;
}
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };

test("scrypt hashes are salted and reject wrong, plaintext and legacy passwords", async () => {
  const one = await hashPassword("test-password-long");
  const two = await hashPassword("test-password-long");
  assert.notEqual(one, two); assert.ok(!one.includes("test-password-long"));
  assert.equal(await verifyPassword("test-password-long", one), true);
  assert.equal(await verifyPassword("wrong", one), false);
  assert.equal(await verifyPassword("plaintext", "plaintext"), false);
  assert.equal(await verifyPassword("anything", "!login-disabled-assessment-customer"), false);
});

test("login, encrypted session, role checks, origin checks, logout and tampering", async () => {
  const jar = new Map();
  let lastOptions;
  const cookieStore = {
    has: (key) => jar.has(key), get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined,
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    set: (name, value, options) => { lastOptions = options; if (options.maxAge === 0) jar.delete(name); else jar.set(name, value); },
  };
  const user = { id: 1, name: "Test Admin", email: "admin@example.test", role: "ADMIN", password: await hashPassword("correct-password") };
  const prisma = { user: { findUnique: async ({ where }) => where.id === 1 || where.email === user.email ? user : null } };
  const env = { AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ORIGIN: "https://example.test", NODE_ENV: "production" };
  const auth = load("../lib/auth.ts", { "node:crypto": crypto, "next/headers": { cookies: async () => cookieStore }, "iron-session": { getIronSession }, "next/server": next, "@/lib/db": { prisma } }, env);
  const loginService = load("../lib/login.ts", { "next/server": next, "@/lib/db": { prisma }, "@/lib/auth": auth, "@/lib/passwords.mjs": { verifyPassword }, "@/lib/login-limit": { allowLogin: () => true } });
  const login = load("../app/api/auth/admin/login/route.ts", { "@/lib/login": loginService });
  const customerLogin = load("../app/api/auth/login/route.ts", { "@/lib/login": loginService });
  const logout = load("../app/api/auth/logout/route.ts", { "next/server": next, "@/lib/auth": auth });
  const request = (password, email = user.email) => new Request("https://example.test/api/auth/login", { method: "POST", headers: { origin: env.AUTH_ORIGIN }, body: JSON.stringify({ email, password }) });
  let called = 0;
  const protectedHandler = auth.withManagement(async () => { called++; return { status: 200 }; });
  assert.equal((await protectedHandler()).status, 401);
  const wrong = await login.POST(request("wrong")); const unknown = await login.POST(request("wrong", "unknown@example.test"));
  assert.equal(wrong.status, 401); assert.equal(wrong.body.error, unknown.body.error);
  assert.equal((await customerLogin.POST(request("correct-password"))).status, 401);
  const valid = await login.POST(request("correct-password")); assert.equal(valid.status, 200);
  assert.equal(valid.body.user.password, undefined); assert.equal(lastOptions.httpOnly, true); assert.equal(lastOptions.secure, true); assert.equal(lastOptions.sameSite, "strict");
  assert.ok(!Array.from(jar.values()).join("").includes(user.password));
  assert.equal((await protectedHandler()).status, 200);
  const customerHandler = auth.withCustomer(async (current) => ({ status: 200, userId: current.id }));
  assert.equal((await customerHandler()).status, 403);
  user.role = "CUSTOMER"; assert.equal((await protectedHandler()).status, 403);
  assert.equal((await login.POST(request("correct-password"))).status, 401);
  assert.equal((await customerLogin.POST(request("correct-password"))).status, 200);
  assert.equal((await customerHandler()).userId, 1);
  assert.equal((await customerHandler(new Request("https://example.test/api/orders", { method: "POST", headers: { origin: "https://foreign.test" } }))).status, 403);
  assert.equal((await logout.POST(request("ignored"))).status, 200);
  assert.equal((await customerHandler()).status, 401);
  user.role = "STAFF";
  assert.equal((await login.POST(request("correct-password"))).status, 200);
  user.role = "STAFF"; assert.equal((await protectedHandler(request("ignored"))).status, 200);
  const foreign = new Request("https://example.test/api/test", { method: "POST", headers: { origin: "https://foreign.test" } });
  assert.equal((await protectedHandler(foreign)).status, 403);
  const originalHash = user.password; user.password = await hashPassword("changed-password");
  assert.equal((await protectedHandler()).status, 401); user.password = originalHash;
  assert.equal((await logout.POST(request("ignored"))).status, 200);
  assert.equal((await protectedHandler()).status, 401);
  jar.set("smart-order-session", "tampered"); assert.equal((await protectedHandler()).status, 401);
  assert.equal(called, 2);
});

test("login throttle blocks repeated attempts and expires", () => {
  const limiter = load("../lib/login-limit.ts", { "node:crypto": crypto });
  for (let i = 0; i < 5; i++) assert.equal(limiter.allowLogin("test@example.test", 0), true);
  assert.equal(limiter.allowLogin("test@example.test", 1), false);
  assert.equal(limiter.allowLogin("test@example.test", 15 * 60 * 1000), true);
});

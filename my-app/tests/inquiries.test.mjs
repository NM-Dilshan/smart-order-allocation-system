import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import ts from "typescript";
import { getIronSession } from "iron-session";
import { hashPassword } from "../lib/passwords.mjs";

function load(file, dependencies = {}, env = process.env) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText, {
    exports, Request, process: { env, cwd: () => process.cwd(), platform: process.platform }, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  return exports;
}
const inquiries = load("../lib/inquiries.ts");
const classifierDependencies = { "server-only": {}, "node:child_process": { execFile }, "node:fs": fs, "node:path": path, "@/lib/inquiries": inquiries };
const classifier = load("../lib/ai-classifier.ts", classifierDependencies);
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } };

test("real Python bridge loads the saved classifier and returns its actual category/probability", async () => {
  const report = JSON.parse(fs.readFileSync(new URL("../ai/reports/evaluation.json", import.meta.url), "utf8"));
  const actual = await classifier.classifyInquiry("Where is my order?");
  const expected = report.sample_predictions.find((sample) => sample.message === "Where is my order?");
  assert.equal(actual.category, expected.category);
  assert.ok(Math.abs(actual.confidence - expected.confidence) < 1e-12);
  assert.ok(actual.confidence >= 0 && actual.confidence <= 1);
});

test("bridge passes hostile text only through stdin, bounds execution, and sanitizes failures", async () => {
  const text = '--json " & echo secrets; $(whoami)\n????';
  let seen;
  const bridge = load("../lib/ai-classifier.ts", { ...classifierDependencies, "node:child_process": { execFile(executable, args, options, callback) {
    seen = { executable, args, options };
    return { stdin: { on() {}, end(input) {
      assert.equal(JSON.parse(input).message, text);
      callback(null, JSON.stringify({ category: "General Inquiry", confidence: 0.01 }));
    } } };
  } } }, { PYTHON_EXECUTABLE: "C:/Python path/python.exe" });
  const result = await bridge.classifyInquiry(text);
  assert.equal(seen.executable, "C:/Python path/python.exe");
  assert.equal(seen.options.shell, false); assert.equal(seen.options.windowsHide, true);
  assert.equal(seen.options.timeout, 20000); assert.equal(seen.options.maxBuffer, 16384);
  assert.equal(seen.options.killSignal, "SIGKILL"); assert.ok(!seen.args.includes(text));
  assert.equal(result.confidence, 0.01); // Low confidence is preserved, not rejected.
  for (const reason of ["ENOENT", "timeout", "model missing", "maxBuffer", "Python traceback secret"]) {
    const failed = load("../lib/ai-classifier.ts", { ...classifierDependencies, "node:child_process": { execFile(_exe, _args, _options, callback) { callback(new Error(reason), ""); return {}; } } });
    await assert.rejects(failed.classifyInquiry("Where is my order?"), (error) => error.message === "Classification is temporarily unavailable. Please try again.");
  }
  const thrown = load("../lib/ai-classifier.ts", { ...classifierDependencies, "node:child_process": { execFile() { throw new Error("private path"); } } });
  await assert.rejects(thrown.classifyInquiry("test"), /temporarily unavailable/);
  await assert.rejects(bridge.classifyInquiry("   "), /temporarily unavailable/);
});

test("prediction protocol rejects unknown labels, malformed JSON and invalid probabilities", () => {
  for (const output of ["traceback", "null", "[]", "{}", '{"category":"Invented","confidence":0.5}', '{"category":"Payment Issue","confidence":-1}', '{"category":"Payment Issue","confidence":1.01}', '{"category":"Payment Issue","confidence":"0.5"}', '{"category":"Payment Issue","confidence":1e999}']) {
    assert.throws(() => classifier.parsePrediction(output), /temporarily unavailable/);
  }
  for (const confidence of [0, 0.1, 1]) assert.equal(classifier.parsePrediction(JSON.stringify({ category: "Payment Issue", confidence })).confidence, confidence);
});

test("inquiry APIs enforce sessions, roles, ownership and no writes before successful classification", async () => {
  const jar = new Map();
  const cookieStore = { has: (key) => jar.has(key), get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined,
    set: (key, value, options) => { if (options.maxAge === 0) jar.delete(key); else jar.set(key, value); } };
  const password = await hashPassword("inquiry-test-password");
  const users = [1, 2, 3, 4].map((id) => ({ id, name: `User ${id}`, email: `${id}@example.test`, password, role: id === 3 ? "ADMIN" : id === 4 ? "STAFF" : "CUSTOMER" }));
  const records = []; let predictionCalls = 0; let failPrediction = false; let failDatabase = false;
  const db = {
    user: { findUnique: async ({ where }) => users.find((user) => user.id === where.id) },
    customerInquiry: {
      create: async ({ data, select }) => {
        if (failDatabase) throw new Error("DATABASE_URL and internal error");
        assert.equal(select, inquiries.customerInquirySelect);
        const row = { id: records.length + 1, createdAt: "2026-09-16T00:00:00Z", adminReply: null, repliedAt: null, repliedById: null, ...data }; records.push(row);
        return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
      },
      findMany: async ({ where, select, take }) => {
        assert.equal(take, 100); assert.equal(select.password, undefined);
        if (where) assert.ok(where.userId);
        return records.filter((row) => !where || row.userId === where.userId).map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, key === "user" ? { name: users[row.userId - 1].name, email: users[row.userId - 1].email } : row[key]])));
      },
    },
    // Any attempt to run order/stock business operations fails this test.
    order: new Proxy({}, { get() { throw new Error("Order must not be accessed"); } }),
    branchInventory: new Proxy({}, { get() { throw new Error("Stock must not be accessed"); } }),
  };
  const env = { AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ORIGIN: "https://example.test" };
  const auth = load("../lib/auth.ts", { "node:crypto": crypto, "next/headers": { cookies: async () => cookieStore }, "iron-session": { getIronSession }, "next/server": next, "@/lib/db": { prisma: db } }, env);
  const deps = { "next/server": next, "@/lib/auth": auth, "@/lib/db": { prisma: db }, "@/lib/inquiries": inquiries,
    "@/lib/ai-classifier": { classifyInquiry: async (text) => { predictionCalls++; if (failPrediction) throw new Error("Python traceback C:/secret"); return classifier.classifyInquiry(text); } } };
  const routes = load("../app/api/inquiries/route.ts", deps);
  const history = load("../app/api/my-inquiries/route.ts", deps);
  const request = (body, origin = env.AUTH_ORIGIN) => new Request("https://example.test/api/inquiries", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
  async function signIn(id) { const session = await auth.getSession(); session.userId = id; session.credentialVersion = auth.credentialVersion(password); await session.save(); }
  assert.equal((await routes.POST(request({ message: "test" }))).status, 401);
  assert.equal((await routes.GET()).status, 401); assert.equal((await history.GET()).status, 401);
  await signIn(1);
  assert.equal((await routes.POST(request({ message: "test" }, "https://foreign.test"))).status, 403);
  for (const body of [null, [], {}, { message: "" }, { message: "   " }, { message: 12 }, { message: "x".repeat(2001) }]) assert.equal((await routes.POST(request(body))).status, 400);
  assert.equal(predictionCalls, 0); assert.equal(records.length, 0);
  const created = await routes.POST(request({ message: "  Where is my order?  ", userId: 2, predictedCategory: "Invented", confidence: 1 }));
  assert.equal(created.status, 201); assert.equal(records[0].userId, 1); assert.equal(records[0].message, "Where is my order?");
  assert.equal(created.body.status, "OPEN"); assert.equal(created.body.adminReply, null); assert.equal(created.body.repliedAt, null);
  assert.ok(records[0].confidence > 0 && records[0].confidence < 1);
  assert.equal(created.body.confidence, undefined); assert.equal(created.body.userId, undefined);
  assert.equal((await routes.GET()).status, 403);
  assert.equal((await history.GET(new Request("https://example.test/api/my-inquiries?userId=2"))).body.length, 1);
  await signIn(2); assert.equal((await history.GET(new Request("https://example.test/api/my-inquiries?userId=1"))).body.length, 0);
  await signIn(1);
  failPrediction = true; const failed = await routes.POST(request({ message: "test failure" }));
  assert.equal(failed.status, 503); assert.ok(!JSON.stringify(failed).includes("traceback")); assert.equal(records.length, 1);
  failPrediction = false; failDatabase = true;
  const dbFailed = await routes.POST(request({ message: "My payment failed" })); assert.equal(dbFailed.status, 500); assert.ok(!JSON.stringify(dbFailed).includes("DATABASE_URL")); assert.equal(records.length, 1);
  failDatabase = false;
  const cancellationMessage = await routes.POST(request({ message: "I want to cancel my order" }));
  assert.equal(cancellationMessage.status, 201); assert.equal(records.length, 2);
  for (const id of [3, 4]) {
    await signIn(id); const listed = await routes.GET(); assert.equal(listed.status, 200); assert.equal(listed.body.length, 2);
    assert.equal(listed.body[0].confidence, records[0].confidence); assert.equal(listed.body[0].user.password, undefined);
    assert.equal((await routes.POST(request({ message: "test" }))).status, 403); assert.equal((await history.GET()).status, 403);
  }
});

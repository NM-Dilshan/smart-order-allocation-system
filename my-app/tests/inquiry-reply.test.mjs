import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import { getIronSession } from "iron-session";
import { hashPassword } from "../lib/passwords.mjs";

function load(file, dependencies = {}, env = process.env) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, {
    exports, Request, process: { env }, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  return exports;
}
const inquiries = load("../lib/inquiries.ts");
const service = load("../lib/inquiry-reply.ts", { "@/lib/inquiries": inquiries });
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };

async function fixture() {
  const jar = new Map();
  const cookies = { has: (key) => jar.has(key), get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key, value) => jar.set(key, value) };
  const password = await hashPassword("reply-test-password");
  const users = ["ADMIN", "STAFF", "CUSTOMER", "CUSTOMER"].map((role, index) => ({ id: index + 1, name: role, email: `${index}@example.test`, password, role }));
  const rows = [1, 2, 3].map((id) => ({ id, userId: 3, message: "Where is my order?", predictedCategory: "Order Status Inquiry", confidence: 0.4895, createdAt: new Date(), status: "OPEN", adminReply: null, repliedAt: null, repliedById: null }));
  const project = (row, select) => row && Object.fromEntries(Object.keys(select).map((key) => [key, ["user", "repliedBy"].includes(key) ? (() => { const user = users.find((user) => user.id === row[key === "user" ? "userId" : "repliedById"]); return user ? { name: user.name, email: user.email } : null; })() : row[key]]));
  let failDatabase = false; let tail = Promise.resolve();
  const db = {
    user: { findUnique: async ({ where }) => users.find((user) => user.id === where.id) },
    customerInquiry: {
      updateMany: async ({ where, data }) => {
        if (failDatabase) throw new Error("Prisma secret DATABASE_URL");
        const row = rows.find((row) => row.id === where.id && row.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
      findUnique: async ({ where, select }) => project(rows.find((row) => row.id === where.id), select),
      findUniqueOrThrow: async ({ where, select }) => project(rows.find((row) => row.id === where.id), select),
      findMany: async ({ where, select }) => { assert.ok(where.userId); return rows.filter((row) => row.userId === where.userId).map((row) => project(row, select)); },
    },
    $transaction(fn, options) {
      assert.equal(options.isolationLevel, "ReadCommitted");
      const work = tail.then(() => fn(db)); tail = work.catch(() => {}); return work;
    },
    order: new Proxy({}, { get() { throw new Error("Order access forbidden"); } }),
    branchInventory: new Proxy({}, { get() { throw new Error("Inventory access forbidden"); } }),
  };
  const env = { AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ORIGIN: "https://example.test" };
  const auth = load("../lib/auth.ts", { "node:crypto": crypto, "next/headers": { cookies: async () => cookies }, "iron-session": { getIronSession }, "next/server": next, "@/lib/db": { prisma: db } }, env);
  const deps = { "next/server": next, "@/lib/auth": auth, "@/lib/db": { prisma: db }, "@/lib/inquiries": inquiries, "@/lib/inquiry-reply": service };
  const route = load("../app/api/inquiries/[id]/reply/route.ts", deps);
  const history = load("../app/api/my-inquiries/route.ts", deps);
  return {
    rows, db, history, route,
    fail() { failDatabase = true; },
    async login(id) { const session = await auth.getSession(); session.userId = id; session.credentialVersion = auth.credentialVersion(password); await session.save(); },
    request(id = "1", body = { reply: "  Your inquiry has been reviewed.  " }, origin = env.AUTH_ORIGIN) {
      return route.POST(new Request("https://example.test/api/inquiries/1/reply", { method: "POST", headers: { origin }, body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    },
  };
}

test("ADMIN and STAFF manually resolve with session identity; resolved replies cannot be overwritten", async () => {
  const f = await fixture();
  for (const id of [1, 2]) {
    await f.login(id); const result = await f.request(String(id));
    assert.equal(result.status, 200); assert.equal(result.body.status, "RESOLVED");
    assert.equal(result.body.adminReply, "Your inquiry has been reviewed.");
    assert.ok(Number.isFinite(new Date(result.body.repliedAt).getTime()));
    assert.equal(f.rows[id - 1].repliedById, id); assert.equal(result.body.repliedBy.email, `${id - 1}@example.test`);
    assert.equal(result.body.repliedBy.password, undefined); assert.equal(result.body.user.password, undefined);
    const original = JSON.stringify(f.rows[id - 1]);
    assert.equal((await f.request(String(id), { reply: "Overwrite" })).status, 409);
    assert.equal(JSON.stringify(f.rows[id - 1]), original);
  }
});

test("guests, customers and foreign origins cannot reply or mutate inquiries", async () => {
  const f = await fixture(); const original = JSON.stringify(f.rows);
  assert.equal((await f.request()).status, 401);
  await f.login(3); assert.equal((await f.request()).status, 403);
  await f.login(1); assert.equal((await f.request("1", { reply: "test" }, "https://foreign.test")).status, 403);
  assert.equal(JSON.stringify(f.rows), original);
});

test("reply validation rejects malformed bodies, blank/long replies, IDs and forged metadata; errors are sanitized", async () => {
  const f = await fixture(); await f.login(1);
  for (const body of [null, [], {}, "{", { reply: null }, { reply: 1 }, { reply: "  " }, { reply: "x".repeat(2001) }, { reply: "test", repliedById: 2 }, { reply: "test", status: "RESOLVED" }]) assert.equal((await f.request("1", body)).status, 400);
  for (const id of ["0", "-1", "1.5", "abc", "1e2", "2147483648"]) assert.equal((await f.request(id)).status, 400);
  assert.ok(f.rows.every((row) => row.status === "OPEN" && row.adminReply === null));
  assert.equal((await f.request("999")).status, 404);
  f.fail(); const result = await f.request(); assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result).includes("DATABASE_URL")); assert.ok(!JSON.stringify(result).includes("Prisma"));
});

test("concurrent service replies keep exactly one response and its responder", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([1, 2].map((id) => f.db.$transaction((tx) => service.replyToInquiry(tx, 1, `Reply ${id}`, id), { isolationLevel: "ReadCommitted" })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
  assert.equal(f.rows[0].adminReply, `Reply ${f.rows[0].repliedById}`);
});

test("customer history exposes own resolved reply only, with no responder account metadata", async () => {
  const f = await fixture(); await f.login(1); await f.request();
  await f.login(3); const own = await f.history.GET(new Request("https://example.test/api/my-inquiries?userId=4"));
  assert.equal(own.body[0].status, "RESOLVED"); assert.equal(own.body[0].adminReply, f.rows[0].adminReply);
  assert.equal(own.body[0].repliedBy, undefined); assert.equal(own.body[0].repliedById, undefined);
  await f.login(4); const other = await f.history.GET(new Request("https://example.test/api/my-inquiries?userId=3"));
  assert.equal(other.body.length, 0);
});

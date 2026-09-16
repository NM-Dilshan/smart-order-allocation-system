import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import { getIronSession } from "iron-session";
import { hashPassword } from "../lib/passwords.mjs";

function load(file, dependencies, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, {
    exports, Request, process: { env }, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  return exports;
}
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
class PrismaError extends Error { constructor(code) { super("private database detail"); this.code = code; } }
const prismaTypes = { Prisma: { PrismaClientKnownRequestError: PrismaError } };
const stock = load("../lib/order-stock.ts", {});
const orders = load("../lib/orders.ts", { "next/server": next, "@/app/generated/prisma/client": prismaTypes, "@/lib/order-stock": stock });
const completion = load("../lib/order-completion.ts", { "@/lib/orders": orders });
const cancellation = load("../lib/order-cancellation.ts", { "@/lib/orders": orders });

// Model rollback and the shared per-order row lock. Live PostgreSQL is also checked separately.
function database(status = "ALLOCATED", quantity = 7, failUpdate = false) {
  let state = { order: status === null ? null : { id: 1, userId: 15, branchId: 1, status, items: [{ productId: 1, quantity: 3 }] }, inventory: { "1:1": quantity, "2:1": 20 } };
  let queue = Promise.resolve();
  return {
    get state() { return state; },
    $transaction(callback, options) {
      assert.equal(options.isolationLevel, "ReadCommitted");
      const run = queue.then(async () => {
        const working = structuredClone(state); let locked = false;
        const tx = {
          $queryRaw: async (sql, id) => { assert.match(sql.join("?"), /SELECT "id" FROM "Order" WHERE "id" = \? FOR UPDATE/); assert.equal(id, 1); locked = true; return working.order ? [{ id }] : []; },
          order: {
            findUniqueOrThrow: async () => { assert.ok(locked); return working.order; },
            update: async ({ where, data }) => {
              assert.ok(locked); assert.equal(where.id, 1);
              if (data.status === "COMPLETED") assert.equal(where.status, "ALLOCATED");
              working.order.status = data.status;
              if (failUpdate) throw new Error("private database detail");
              return working.order;
            },
          },
          branchInventory: {
            updateMany: async ({ where, data }) => { const key = `${where.branchId}:${where.productId}`; if (working.inventory[key] < where.quantity.gte) return { count: 0 }; working.inventory[key] -= data.quantity.decrement; return { count: 1 }; },
            upsert: async ({ where, update }) => { assert.ok(locked); const { branchId, productId } = where.branchId_productId; assert.equal(branchId, working.order.branchId); working.inventory[`${branchId}:${productId}`] += update.quantity.increment; },
          },
        };
        const result = await callback(tx); state = working; return result;
      });
      queue = run.catch(() => {}); return run;
    },
  };
}
function routes(db, auth = { withManagement: (handler) => handler }) {
  const deps = { "next/server": next, "@/lib/db": { prisma: db }, "@/lib/auth": auth, "@/lib/orders": orders, "@/app/generated/prisma/client": prismaTypes, "@/lib/order-completion": completion, "@/lib/order-cancellation": cancellation };
  return { complete: load("../app/api/orders/[id]/complete/route.ts", deps).POST, cancel: load("../app/api/orders/[id]/cancel/route.ts", deps).POST };
}
const context = (id = "1") => ({ params: Promise.resolve({ id }) });
const request = (origin = "https://example.test") => new Request("https://example.test/api/orders/1/complete", { method: "POST", headers: { origin }, body: JSON.stringify({ status: "PENDING", branchId: 999 }) });

test("allocated completion changes only status; allocation deduction 10 -> 7 remains 7", async () => {
  const db = database("ALLOCATED", 10);
  await db.$transaction((tx) => stock.deductOrderStock(tx, 1, [{ productId: 1, quantity: 3 }]), { isolationLevel: "ReadCommitted" });
  assert.equal(db.state.inventory["1:1"], 7);
  const before = structuredClone(db.state);
  const result = await routes(db).complete(request(), context());
  assert.equal(result.status, 200); assert.equal(result.body.status, "COMPLETED");
  assert.deepEqual(db.state, { ...before, order: { ...before.order, status: "COMPLETED" } });
  assert.equal((await routes(db).complete(request(), context())).status, 409);
  assert.equal((await routes(db).cancel(request(), context())).status, 409);
  assert.equal(db.state.inventory["1:1"], 7);
});

test("pending and terminal orders reject completion without state changes", async () => {
  for (const status of ["PENDING", "COMPLETED", "CANCELLED"]) {
    const db = database(status); const before = structuredClone(db.state);
    assert.equal((await routes(db).complete(request(), context())).status, 409);
    assert.deepEqual(db.state, before);
  }
});

test("normal cancellation restores once, and cancelled orders cannot complete", async () => {
  const db = database(); const api = routes(db);
  assert.equal((await api.cancel(request(), context())).status, 200);
  assert.equal(db.state.order.status, "CANCELLED"); assert.equal(db.state.inventory["1:1"], 10);
  assert.equal((await api.cancel(request(), context())).status, 409);
  assert.equal((await api.complete(request(), context())).status, 409);
  assert.equal(db.state.inventory["1:1"], 10);
});

test("concurrent completion permits exactly one successful transition", async () => {
  const db = database(); const api = routes(db);
  const results = await Promise.all([api.complete(request(), context()), api.complete(request(), context())]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(db.state.order.status, "COMPLETED"); assert.equal(db.state.inventory["1:1"], 7);
});

test("completion and cancellation share a lock: either winner is terminal with correct stock", async () => {
  for (const first of ["complete", "cancel"]) {
    const db = database(); const api = routes(db); const second = first === "complete" ? "cancel" : "complete";
    const results = await Promise.all([api[first](request(), context()), api[second](request(), context())]);
    assert.deepEqual(results.map((result) => result.status), [200, 409]);
    assert.equal(db.state.order.status, first === "complete" ? "COMPLETED" : "CANCELLED");
    assert.equal(db.state.inventory["1:1"], first === "complete" ? 7 : 10);
    assert.equal(db.state.inventory["2:1"], 20);
  }
});

test("invalid IDs, missing orders, update rollback and sanitized database conflicts", async () => {
  for (const id of ["abc", "0", "-1", "1.5", "2147483648", "1 OR 1=1"]) assert.equal((await routes(database()).complete(request(), context(id))).status, 400);
  assert.equal((await routes(database(null)).complete(request(), context())).status, 404);
  const db = database("ALLOCATED", 7, true); const before = structuredClone(db.state);
  const failed = await routes(db).complete(request(), context()); assert.equal(failed.status, 500); assert.ok(!JSON.stringify(failed).includes("private")); assert.deepEqual(db.state, before);
  for (const code of ["P2034", "P2025"]) {
    const result = await routes({ $transaction: async () => { throw new PrismaError(code); } }).complete(request(), context());
    assert.equal(result.status, 409); assert.ok(!JSON.stringify(result).includes("private"));
  }
});

test("real session guard permits ADMIN/STAFF, denies CUSTOMER/guest and foreign origins", async () => {
  const jar = new Map();
  const cookieStore = { has: (key) => jar.has(key), get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key, value, options) => { if (options.maxAge === 0) jar.delete(key); else jar.set(key, value); } };
  const user = { id: 1, name: "Status Test", email: "status@example.test", role: "CUSTOMER", password: await hashPassword("status-test-password") };
  const env = { AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ORIGIN: "https://example.test" };
  const auth = load("../lib/auth.ts", { "node:crypto": crypto, "next/headers": { cookies: async () => cookieStore }, "iron-session": { getIronSession }, "next/server": next, "@/lib/db": { prisma: { user: { findUnique: async () => user } } } }, env);
  const db = database(); const api = routes(db, auth);
  assert.equal((await api.complete(request(), context())).status, 401);
  const session = await auth.getSession(); session.userId = user.id; session.credentialVersion = auth.credentialVersion(user.password); await session.save();
  assert.equal((await api.complete(request(), context())).status, 403); assert.equal(db.state.order.status, "ALLOCATED");
  for (const role of ["ADMIN", "STAFF"]) {
    user.role = role; const current = database(); const guarded = routes(current, auth);
    assert.equal((await guarded.complete(request("https://foreign.test"), context())).status, 403);
    assert.equal(current.state.order.status, "ALLOCATED");
    assert.equal((await guarded.complete(request(), context())).status, 200);
    assert.equal(current.state.order.status, "COMPLETED"); assert.equal(current.state.inventory["1:1"], 7);
  }
});

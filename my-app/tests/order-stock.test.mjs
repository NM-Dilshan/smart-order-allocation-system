import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, {
    exports, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  return exports;
}
const stock = load("../lib/order-stock.ts");
const allocation = load("../lib/allocation.ts");
class PrismaError extends Error { constructor(code) { super("private details"); this.code = code; } }
const response = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
const orders = load("../lib/orders.ts", { "@/lib/order-stock": stock, "next/server": response, "@/app/generated/prisma/client": { Prisma: { PrismaClientKnownRequestError: PrismaError } } });

test("A/B: availability uses one branch for all items, never combined totals", async () => {
  let inventories = [{ 1: 10 }, { 1: 20 }, { 1: 5 }];
  const db = {
    order: { groupBy: async () => [] },
    branchInventory: { groupBy: async ({ where }) => where.productId.in.map((productId) => ({ productId, _max: { quantity: Math.max(0, ...inventories.map((inventory) => inventory[productId] ?? 0)) } })) },
    product: { findMany: async ({ where }) => where.id.in.map((id) => ({ id })) },
    branch: { findMany: async ({ where }) => inventories.map((stock, index) => ({ ...stock, id: index + 1, name: `Branch ${index + 1}`, latitude: 0, longitude: index + 1 })).filter((inventory) => where.AND.every(({ inventories: { some } }) => (inventory[some.productId] ?? 0) >= some.quantity.gte)) },
  };
  const route = load("../app/api/orders/availability/route.ts", { "next/server": response, "@/lib/db": { prisma: db }, "@/lib/orders": orders, "@/lib/allocation": allocation });
  const check = (items) => route.POST({ json: async () => ({ customerLatitude: 0, customerLongitude: 0, items }) });
  const unavailable = (await check([{ productId: 1, quantity: 25 }])).body;
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.maximumStock, undefined);
  assert.equal(unavailable.bestAvailableBranch, undefined);
  assert.equal((await check([{ productId: 99, quantity: 1 }])).body.available, false);
  inventories = [{ 1: 20, 2: 2 }, { 1: 10, 2: 8 }];
  assert.equal((await check([{ productId: 1, quantity: 10 }, { productId: 2, quantity: 5 }])).body.available, true);
  inventories = [{ 1: 20, 2: 2 }, { 1: 2, 2: 8 }];
  assert.equal((await check([{ productId: 1, quantity: 10 }, { productId: 2, quantity: 5 }])).body.available, false);
  for (const items of [[], [{ productId: 1, quantity: -1 }], [{ productId: 1, quantity: 1.5 }], [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }]]) assert.equal((await check(items)).status, 400);
});

// Model atomic database updates/rollback; this does not substitute for a live PostgreSQL concurrency test.
function database(initial) {
  let state = { inventory: { ...initial }, orders: 0 };
  let queue = Promise.resolve();
  const db = {
    get state() { return state; },
    $transaction(callback) {
      const run = queue.then(async () => {
        const working = structuredClone(state);
        const tx = {
          product: { findMany: async ({ where }) => where.id.in.map((id) => ({ id })) },
          user: { upsert: async () => ({ id: 1 }) },
          order: { create: async ({ data }) => { working.orders++; return { id: working.orders, ...data }; } },
          branchInventory: { updateMany: async ({ where, data }) => {
            const key = `${where.branchId}:${where.productId}`;
            if (!(key in working.inventory) || working.inventory[key] < where.quantity.gte) return { count: 0 };
            assert.equal(where.quantity.gte, data.quantity.decrement);
            working.inventory[key] -= data.quantity.decrement;
            return { count: 1 };
          } },
        };
        const result = await callback(tx);
        state = working;
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return db;
}
function route(db) {
  return load("../app/api/orders/route.ts", {
    "next/server": response, "@/lib/db": { prisma: db }, "@/lib/orders": orders, "@/lib/order-stock": stock,
    "@/lib/auth": { withManagement: (handler) => handler, withCustomer: (handler) => (...args) => handler({ id: 15, role: "CUSTOMER" }, ...args) },
    "@/lib/assessment-customer": { getAssessmentCustomer: (tx) => tx.user.upsert({}) },
    // Force a previously eligible selection to exercise stock changes after allocation.
    "@/lib/allocation": { allocateOrder: async () => ({ branchId: 1, branchName: "Selected" }) },
  });
}
const request = (items) => ({ json: async () => ({ customerLatitude: 0, customerLongitude: 0, items }) });

test("C/D/E: selected branch deductions, multiple items and other branches untouched", async () => {
  const db = database({ "1:1": 10, "1:2": 8, "2:1": 20 });
  assert.equal((await route(db).POST(request([{ productId: 1, quantity: 3 }]))).status, 201);
  assert.equal(db.state.inventory["1:1"], 7);
  const multi = database({ "1:1": 10, "1:2": 8, "2:1": 20 });
  assert.equal((await route(multi).POST(request([{ productId: 2, quantity: 3 }, { productId: 1, quantity: 2 }]))).status, 201);
  assert.deepEqual(multi.state.inventory, { "1:1": 8, "1:2": 5, "2:1": 20 });
});
test("F/G: later deduction failure rolls back earlier deductions and prevents order creation", async () => {
  const db = database({ "1:1": 10, "1:2": 2 });
  assert.equal((await route(db).POST(request([{ productId: 1, quantity: 5 }, { productId: 2, quantity: 3 }]))).status, 409);
  assert.deepEqual(db.state, { inventory: { "1:1": 10, "1:2": 2 }, orders: 0 });
});
test("H: competing requests cannot both consume four of five units in atomic update model", async () => {
  const db = database({ "1:1": 5 });
  const handler = route(db);
  const results = await Promise.all([handler.POST(request([{ productId: 1, quantity: 4 }])), handler.POST(request([{ productId: 1, quantity: 4 }]))]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(db.state.inventory["1:1"], 1); assert.equal(db.state.orders, 1);
});
test("order creation failure rolls back stock; serialization conflicts are sanitized 409", async () => {
  const db = database({ "1:1": 10 });
  const wrapped = { $transaction: (callback) => db.$transaction((tx) => {
    tx.order.create = async () => { throw new Error("private details"); };
    return callback(tx);
  }) };
  assert.equal((await route(wrapped).POST(request([{ productId: 1, quantity: 3 }]))).status, 500);
  assert.equal(db.state.inventory["1:1"], 10);
  const result = orders.orderError(new PrismaError("P2034"));
  assert.equal(result.status, 409); assert.ok(!JSON.stringify(result).includes("private"));
});

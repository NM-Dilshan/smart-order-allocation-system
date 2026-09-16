import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual TypeScript modules without adding a test runner dependency.
function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const allocation = load("../lib/allocation.ts");
const stock = load("../lib/order-stock.ts");
const branch = (id, longitude, stock) => ({ id, name: `Branch ${id}`, latitude: 0, longitude, stock });
function transaction(branches, workloads = []) {
  return {
    branch: { findMany: async ({ where }) => branches.filter((branch) => where.AND.every(({ inventories: { some } }) => (branch.stock[some.productId] ?? -1) >= some.quantity.gte)) },
    order: { groupBy: async ({ where }) => {
      assert.deepEqual(Array.from(where.status.in), ["ALLOCATED"]);
      return workloads.filter((row) => where.branchId.in.includes(row.branchId));
    } },
  };
}

test("A/B: every requested product must have enough stock in one branch", async () => {
  const tx = transaction([branch(1, 1, { 1: 10, 2: 2 }), branch(2, 2, { 1: 2, 2: 3 }), branch(3, 3, { 1: 5 })]);
  assert.deepEqual(Array.from(await allocation.findEligibleBranches(tx, [{ productId: 1, quantity: 5 }]), (b) => b.id), [1, 3]);
  assert.deepEqual(Array.from(await allocation.findEligibleBranches(tx, [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }]), (b) => b.id), [2]);
});
test("Haversine: identical, equatorial degree, antipodal and date-line points", () => {
  assert.equal(allocation.calculateHaversineDistance(0, 0, 0, 0), 0);
  assert.ok(Math.abs(allocation.calculateHaversineDistance(0, 0, 0, 1) - 111.1949266) < 0.001);
  assert.ok(Math.abs(allocation.calculateHaversineDistance(0, 0, 0, 180) - Math.PI * 6371) < 0.001);
  assert.ok(allocation.calculateHaversineDistance(0, 179, 0, -179) < 223);
});
test("C: nearer branch wins with equal workload", async () => {
  const result = await allocation.allocateOrder(transaction([branch(1, 2, { 1: 5 }), branch(2, 1, { 1: 5 })]), [{ productId: 1, quantity: 2 }], 0, 0);
  assert.equal(result.branchId, 2);
});
test("D: workload can favor a slightly farther branch; excluded branches do not affect normalization", async () => {
  const tx = transaction([branch(1, 1, { 1: 5 }), branch(2, 1.1, { 1: 5 }), branch(3, 100, { 1: 0 })], [{ branchId: 1, _count: { _all: 10 } }]);
  const result = await allocation.allocateOrder(tx, [{ productId: 1, quantity: 2 }], 0, 0);
  assert.equal(result.branchId, 2);
  assert.equal(result.score, 0.7);
});
test("zero normalization and deterministic score/distance/workload/ID tie-breaks", () => {
  const zero = allocation.normalizeMetrics([{ branchId: 1, distanceKm: 0, workload: 0 }])[0];
  assert.equal(zero.normalizedDistance, 0); assert.equal(zero.normalizedWorkload, 0);
  const candidate = { branchId: 10, score: 0.5, distanceKm: 5, workload: 2 };
  for (const alternative of [{ score: 0.4 }, { distanceKm: 4 }, { workload: 1 }, { branchId: 1 }]) {
    const better = { ...candidate, ...alternative };
    assert.equal(allocation.selectBestBranch([candidate, better]), better);
    assert.equal(allocation.selectBestBranch([better, candidate]), better);
  }
  assert.equal(allocation.selectBestBranch([]), null);
});
test("E/integration: 409 has no writes; successful allocation deducts selected inventory", async () => {
  const { validateOrder, orderInclude } = load("../lib/orders.ts", {
    "@/app/generated/prisma/client": { Prisma: {} }, "next/server": {}, "@/lib/order-stock": stock,
  });
  let writes = 0;
  let eligible = false;
  const db = { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    const tx = transaction(eligible ? [branch(1, 1, { 1: 5 })] : []);
    tx.product = { findMany: async () => [{ id: 1 }] };
    tx.user = { upsert: async () => { writes++; return { id: 7 }; } };
    tx.order.create = async ({ data }) => {
      writes++; assert.equal(data.status, "ALLOCATED"); assert.equal(data.branchId, 1);
      return { id: 3, ...data };
    };
    tx.branchInventory = { updateMany: async ({ where, data }) => {
      assert.equal(where.branchId, 1); assert.equal(where.productId, 1);
      assert.equal(where.quantity.gte, 2); assert.equal(data.quantity.decrement, 2);
      return { count: 1 };
    } };
    return callback(tx);
  } };
  const route = load("../app/api/orders/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/db": { prisma: db }, "@/lib/allocation": allocation,
    "@/lib/auth": { withManagement: (handler) => handler },
    "@/lib/assessment-customer": { getAssessmentCustomer: (tx) => tx.user.upsert({}) },
    "@/lib/order-stock": stock,
    "@/lib/orders": { validateOrder, orderInclude, orderError: (error) => { throw error; } },
  });
  const request = { json: async () => ({ customerLatitude: 0, customerLongitude: 0, items: [{ productId: 1, quantity: 2 }] }) };
  const failed = await route.POST(request);
  assert.equal(failed.status, 409); assert.equal(writes, 0);
  eligible = true;
  const success = await route.POST(request);
  assert.equal(success.status, 201); assert.equal(writes, 2);
  assert.equal(success.body.id, 3); assert.equal(success.body.allocation.branchId, 1);
});

test("availability selects the full score winner, excludes insufficient nearest stock, and validates coordinates", async () => {
  let branches = [branch(1, 0.01, { 1: 1 }), branch(2, 0.02, { 1: 10 })];
  let workloads = [];
  const db = {
    product: { findMany: async () => [{ id: 1 }] },
    branch: { findMany: (args) => transaction(branches).branch.findMany(args) },
    order: { groupBy: (args) => transaction(branches, workloads).order.groupBy(args) },
  };
  const response = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
  const orders = load("../lib/orders.ts", { "@/app/generated/prisma/client": { Prisma: {} }, "next/server": response, "@/lib/order-stock": stock });
  const preview = load("../app/api/orders/availability/route.ts", { "next/server": response, "@/lib/db": { prisma: db }, "@/lib/orders": orders, "@/lib/allocation": allocation });
  const body = { customerLatitude: 0, customerLongitude: 0, items: [{ productId: 1, quantity: 3 }] };
  assert.equal((await preview.POST({ json: async () => body })).body.bestAvailableBranch.branchId, 2);
  branches = [branch(1, 1, { 1: 10 }), branch(2, 1.1, { 1: 10 })];
  workloads = [{ branchId: 1, _count: { _all: 10 } }];
  const weighted = (await preview.POST({ json: async () => body })).body.bestAvailableBranch;
  assert.equal(weighted.branchId, 2); assert.equal(weighted.score, 0.7);
  for (const value of [undefined, "0", 91, NaN]) {
    assert.equal((await preview.POST({ json: async () => ({ ...body, customerLatitude: value }) })).status, 400);
  }
  workloads = [];
  assert.equal((await preview.POST({ json: async () => body })).body.bestAvailableBranch.branchId, 1);
  // Stock changes after the preview: placement must run the real service again.
  branches[0].stock[1] = 0;
  let deductedBranch;
  db.$transaction = async (callback) => callback({ ...db,
    branchInventory: { updateMany: async ({ where }) => { deductedBranch = where.branchId; return { count: 1 }; } },
    order: { ...db.order, create: async ({ data }) => ({ id: 1, ...data }) },
  });
  const final = load("../app/api/orders/route.ts", {
    "next/server": response, "@/lib/db": { prisma: db }, "@/lib/orders": orders, "@/lib/allocation": allocation,
    "@/lib/order-stock": stock, "@/lib/auth": { withManagement: (handler) => handler },
    "@/lib/assessment-customer": { getAssessmentCustomer: async () => ({ id: 1 }) },
  });
  const placed = await final.POST({ json: async () => ({ ...body, branchId: 1 }) });
  assert.equal(placed.status, 201); assert.equal(placed.body.allocation.branchId, 2); assert.equal(deductedBranch, 2);
});

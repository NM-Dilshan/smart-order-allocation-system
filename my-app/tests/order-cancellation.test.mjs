import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, { exports, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  return exports;
}
const cancellation = load("../lib/order-cancellation.ts", { "@/lib/orders": { orderInclude: {} } });
const initialOrder = { id: 1, status: "ALLOCATED", branchId: 1, items: [{ productId: 1, quantity: 3 }] };

// Simulates transaction rollback and serialized row locks; live PostgreSQL is not required.
function database(order = initialOrder, inventory = { "1:1": 7, "2:1": 20 }, failProduct = null, failStatus = false) {
  let state = structuredClone({ order, inventory });
  let queue = Promise.resolve();
  return {
    get state() { return state; },
    $transaction(callback, options) {
      assert.equal(options.isolationLevel, "ReadCommitted");
      const run = queue.then(async () => {
        const working = structuredClone(state);
        let locked = false;
        const tx = {
          $queryRaw: async (sql, id) => { assert.match(sql.join("?"), /FOR UPDATE/); assert.equal(id, 1); locked = true; return working.order ? [{ id }] : []; },
          order: {
            findUniqueOrThrow: async () => { assert.ok(locked); return working.order; },
            update: async ({ data }) => { if (failStatus) throw new Error("private database detail"); working.order.status = data.status; return working.order; },
          },
          branchInventory: { upsert: async ({ where, create, update }) => {
            assert.ok(locked);
            const { branchId, productId } = where.branchId_productId;
            if (productId === failProduct) throw new Error("private database detail");
            assert.equal(branchId, working.order.branchId);
            const key = `${branchId}:${productId}`;
            working.inventory[key] = key in working.inventory ? working.inventory[key] + update.quantity.increment : create.quantity;
          } },
        };
        const result = await callback(tx); state = working; return result;
      });
      queue = run.catch(() => {}); return run;
    },
  };
}
function route(db) {
  return load("../app/api/orders/[id]/cancel/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "@/app/generated/prisma/client": { Prisma: { PrismaClientKnownRequestError: class extends Error {} } },
    "@/lib/db": { prisma: db }, "@/lib/order-cancellation": cancellation,
    "@/lib/auth": { withManagement: (handler) => handler },
    "@/lib/orders": { parseOrderId: (value) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647 ? Number(value) : null },
  });
}
const cancel = (db, id = "1") => route(db).POST({}, { params: Promise.resolve({ id }) });

test("A/C/E: restores original branch once and rejects a second cancellation", async () => {
  const db = database();
  assert.equal((await cancel(db)).status, 200);
  assert.equal(db.state.order.status, "CANCELLED");
  assert.deepEqual(db.state.inventory, { "1:1": 10, "2:1": 20 });
  assert.equal((await cancel(db)).status, 409);
  assert.equal(db.state.inventory["1:1"], 10);
});
test("B: all products restored together, including a removed zero-stock row", async () => {
  const order = { ...initialOrder, items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }] };
  const db = database(order, { "1:1": 8, "1:2": 5 });
  assert.equal((await cancel(db)).status, 200);
  assert.deepEqual(db.state.inventory, { "1:1": 10, "1:2": 8 });
  const missing = database(initialOrder, {});
  assert.equal((await cancel(missing)).status, 200); assert.equal(missing.state.inventory["1:1"], 3);
});
test("D: completed, pending, cancelled and unassigned orders reject without changes", async () => {
  for (const change of [{ status: "COMPLETED" }, { status: "PENDING" }, { status: "CANCELLED" }, { branchId: null }]) {
    const db = database({ ...initialOrder, ...change }); const before = structuredClone(db.state);
    assert.equal((await cancel(db)).status, 409); assert.deepEqual(db.state, before);
  }
});
test("F: restoration or status failure rolls back everything and sanitizes errors", async () => {
  for (const failStatus of [false, true]) {
    const db = database({ ...initialOrder, items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }] }, { "1:1": 8, "1:2": 5 }, failStatus ? null : 2, failStatus);
    const before = structuredClone(db.state); const result = await cancel(db);
    assert.equal(result.status, 500); assert.deepEqual(db.state, before); assert.ok(!JSON.stringify(result).includes("private"));
  }
});
test("G: concurrent cancellation model allows one restoration only", async () => {
  const db = database(); const results = await Promise.all([cancel(db), cancel(db)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(db.state.inventory["1:1"], 10); assert.equal(db.state.order.status, "CANCELLED");
});
test("invalid IDs and absent orders return 400 and 404", async () => {
  assert.equal((await cancel(database(), "abc")).status, 400);
  assert.equal((await cancel(database(null))).status, 404);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { hashPassword, verifyPassword } from "../lib/passwords.mjs";

function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, process, URL, Date, Set, Map, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const data = load("../prisma/demo-data.ts");
const seed = load("../prisma/seed-demo.ts", {
  "node:crypto": { randomBytes: () => { throw new Error("Passwords supplied by test"); } },
  "../lib/passwords.mjs": { hashPassword },
  "../lib/allocation": load("../lib/allocation.ts"),
  "../lib/order-stock": load("../lib/order-stock.ts"),
  "../lib/order-completion": load("../lib/order-completion.ts", { "@/lib/orders": { orderInclude: {} } }),
  "../lib/order-cancellation": load("../lib/order-cancellation.ts", { "@/lib/orders": { orderInclude: {} } }),
  "./demo-data": data,
});
const passwords = ["Test customer password one!", "Test customer password two!"];

// This transactional store exercises the real allocation and stock helpers without a database.
function database() {
  let state = { product: [], branch: [], branchInventory: [], user: [], order: [], customerInquiry: [] };
  const controls = { failOrder: false, noStock: false };
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => value instanceof Date
      ? row[key]?.getTime() === value.getTime() : row[key] === value);
  }
  return {
    controls,
    get state() { return state; },
    async run() {
      const before = structuredClone(state);
      const tx = { $queryRaw: async (parts, id) => parts.join("").includes("pg_advisory") ? []
        : state.order.filter((row) => row.id === id).map(({ id }) => ({ id })) };
      for (const model of Object.keys(state)) {
        const rows = () => state[model];
        tx[model] = {
          findMany: async ({ where }) => rows().filter((row) => where.AND
            ? where.AND.every(({ inventories: { some } }) => state.branchInventory.some((stock) =>
              stock.branchId === row.id && stock.productId === some.productId && stock.quantity >= some.quantity.gte))
            : matches(row, where)),
          findUnique: async ({ where }) => rows().find((row) => matches(row, where.branchId_productId ?? where)) ?? null,
          findFirst: async ({ where }) => rows().find((row) => matches(row, where)) ?? null,
          findUniqueOrThrow: async ({ where }) => {
            const row = rows().find((row) => matches(row, where));
            if (!row) throw new Error("Missing record");
            return row;
          },
          create: async ({ data }) => {
            if (model === "order" && controls.failOrder) throw new Error("Simulated order write failure");
            const row = { ...structuredClone(data), id: Math.max(0, ...rows().map((r) => r.id)) + 1 };
            if (model === "order") row.items = row.items.create;
            if (model === "branchInventory" && controls.noStock) row.quantity = 0;
            rows().push(row); return row;
          },
          update: async ({ where, data }) => {
            const row = rows().find((row) => matches(row, where));
            if (!row) throw new Error("Missing record");
            Object.assign(row, data); return row;
          },
          updateMany: async ({ where, data }) => {
            const row = rows().find((row) => row.branchId === where.branchId && row.productId === where.productId
              && row.quantity >= where.quantity.gte);
            if (!row) return { count: 0 };
            row.quantity -= data.quantity.decrement; return { count: 1 };
          },
          upsert: async ({ where, create, update }) => {
            const row = rows().find((row) => matches(row, where.branchId_productId));
            if (row) { row.quantity += update.quantity.increment; return row; }
            const added = { ...create, id: Math.max(0, ...rows().map((r) => r.id)) + 1 };
            rows().push(added); return added;
          },
          groupBy: async ({ where }) => {
            const counts = new Map();
            for (const row of rows()) if (where.branchId.in.includes(row.branchId) && where.status.in.includes(row.status)) {
              counts.set(row.branchId, (counts.get(row.branchId) ?? 0) + 1);
            }
            return Array.from(counts, ([branchId, count]) => ({ branchId, _count: { _all: count } }));
          },
        };
      }
      try { return await seed.seedDemo(tx, passwords); }
      catch (error) { state = before; throw error; }
    },
  };
}

test("seed rejects missing, invalid and remote targets unless explicitly allowed", () => {
  assert.throws(() => seed.validateSeedTarget(undefined, false));
  assert.throws(() => seed.validateSeedTarget("https://localhost/db", false));
  assert.throws(() => seed.validateSeedTarget("postgresql://demo@remote.example/db", false), /Remote database blocked/);
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.ok(seed.validateSeedTarget(`postgresql://demo@${host}/demo`, false));
  assert.ok(seed.validateSeedTarget("postgresql://demo@remote.example/db", true));
});

test("fresh seed creates all fixtures with hashed passwords and consistent order stock", async () => {
  const db = database();
  const result = await db.run();
  assert.equal(JSON.stringify(result.created), JSON.stringify({ products: 10, branches: 4, inventories: 40, users: 2, orders: 3, inquiries: 4 }));
  for (const [index, user] of db.state.user.entries()) {
    assert.equal(user.role, "CUSTOMER");
    assert.notEqual(user.password, passwords[index]);
    assert.ok(await verifyPassword(passwords[index], user.password));
  }
  const stock = (branch, product) => db.state.branchInventory.find((row) => row.branchId === branch + 1 && row.productId === product + 1).quantity;
  assert.equal(db.state.order[0].branchId, 2);
  assert.equal(stock(0, 6), 2); assert.equal(stock(1, 6), 30); assert.equal(stock(1, 9), 10);
  assert.equal(stock(2, 0), 58); assert.equal(stock(2, 1), 92);
  assert.equal(stock(3, 2), 25); assert.equal(stock(3, 8), 65);
  assert.deepEqual(db.state.order.map((row) => row.status), ["ALLOCATED", "COMPLETED", "CANCELLED"]);
  assert.ok(db.state.customerInquiry.every((row) => row.status === "OPEN" && row.confidence === 0 && row.message.startsWith("[Demo inquiry]")));
});

test("reruns preserve changed prices, credentials, stock, statuses, replies and removed inventory", async () => {
  const db = database(); await db.run();
  db.state.product[0].price = 999;
  db.state.user[0].password = await hashPassword("Changed customer password!");
  db.state.order[0].status = "COMPLETED";
  db.state.branchInventory[0].quantity = 7;
  db.state.branchInventory.splice(9, 1);
  Object.assign(db.state.customerInquiry[0], { status: "RESOLVED", adminReply: "Existing support reply" });
  const before = structuredClone(db.state);
  const result = await db.run();
  assert.ok(Object.values(result.created).every((count) => count === 0));
  assert.equal(result.credentials.length, 0);
  assert.deepEqual(db.state, before);
});

test("unrelated records are preserved and demo account collisions roll back the whole seed", async () => {
  const db = database();
  db.state.product.push({ id: 100, name: "Real product", price: 250 });
  db.state.user.push({ id: 100, name: "Real Administrator", email: data.demoCustomers[0].email, password: "scrypt$existing", role: "ADMIN" });
  const before = structuredClone(db.state);
  await assert.rejects(db.run(), /Existing account does not match/);
  assert.deepEqual(db.state, before);
});

test("order write failure and unavailable stock roll back catalog, accounts and deductions", async () => {
  for (const control of ["failOrder", "noStock"]) {
    const db = database(); db.controls[control] = true;
    await assert.rejects(db.run());
    assert.ok(Object.values(db.state).every((rows) => rows.length === 0));
  }
});

test("ambiguous demo names are rejected without altering existing records", async () => {
  const db = database();
  db.state.product.push({ id: 10, ...data.demoProducts[0] }, { id: 11, ...data.demoProducts[0] });
  const before = structuredClone(db.state);
  await assert.rejects(db.run(), /Ambiguous demo product/);
  assert.deepEqual(db.state, before);
});

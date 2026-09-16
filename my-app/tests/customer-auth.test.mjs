import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import { getIronSession } from "iron-session";
import { hashPassword, verifyPassword } from "../lib/passwords.mjs";

function load(path, dependencies = {}, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, {
    exports, Request, process: { env }, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  return exports;
}
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } };
class PrismaError extends Error { constructor(code) { super("private database error"); this.code = code; } }
const prismaTypes = { Prisma: { PrismaClientKnownRequestError: PrismaError } };
const origin = "https://example.test";
const request = (body, method = "POST", requestOrigin = origin) => new Request(`${origin}/api/test`, { method, headers: { origin: requestOrigin }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });

test("registration validates, normalizes, hashes, fixes CUSTOMER role, and handles duplicates safely", async () => {
  const users = [];
  let throttled = false;
  const route = load("../app/api/auth/register/route.ts", {
    "next/server": next, "@/app/generated/prisma/client": prismaTypes,
    "@/lib/db": { prisma: { user: { create: async ({ data, select }) => {
      assert.equal(select.id, true);
      if (users.some((user) => user.email === data.email)) throw new PrismaError("P2002");
      users.push(data); return { id: users.length };
    } } } },
    "@/lib/auth": { validOrigin: (req) => req.headers.get("origin") === origin },
    "@/lib/passwords.mjs": { hashPassword }, "@/lib/login-limit": { allowLogin: () => !throttled },
  });
  const body = { name: " Customer ", email: " Customer@Example.Test ", password: "long-enough-password", confirmPassword: "long-enough-password", role: "ADMIN", id: 999 };
  assert.equal((await route.POST(request(body, "POST", "https://foreign.test"))).status, 403);
  for (const change of [{ name: " " }, { email: "bad" }, { email: "assessment-customer@smart-order.invalid" }, { password: "short" }, { confirmPassword: "wrong" }, { confirmPassword: undefined }, { password: "x".repeat(257) }]) {
    assert.equal((await route.POST(request({ ...body, ...change }))).status, 400);
  }
  assert.equal(users.length, 0);
  const result = await route.POST(request(body));
  assert.equal(result.status, 201); assert.equal(result.body.user, undefined);
  assert.equal(users[0].role, "CUSTOMER"); assert.equal(users[0].id, undefined);
  assert.equal(users[0].email, "customer@example.test"); assert.equal(users[0].name, "Customer");
  assert.ok(users[0].password.startsWith("scrypt$")); assert.ok(await verifyPassword(body.password, users[0].password));
  assert.ok(!JSON.stringify(result).includes(body.password));
  assert.equal((await route.POST(request({ ...body, email: "customer@example.test" }))).status, 409);
  assert.equal(users.length, 1);
  throttled = true; assert.equal((await route.POST(request(body))).status, 429);
});

test("customer session owns placement and reads; guests, other customers, and management cannot bypass authorization", async () => {
  const jar = new Map();
  const cookieStore = { has: (name) => jar.has(name), get: (name) => jar.has(name) ? { value: jar.get(name) } : undefined,
    set: (name, value, options) => { if (options.maxAge === 0) jar.delete(name); else jar.set(name, value); } };
  const password = await hashPassword("customer-test-password");
  const users = [1, 2, 3, 4].map((id) => ({ id, name: `User ${id}`, email: `${id}@example.test`, password, role: id === 3 ? "ADMIN" : id === 4 ? "STAFF" : "CUSTOMER" }));
  let stockQuantity = 10; const records = [];
  const customerOrders = load("../lib/customer-orders.ts");
  const safe = (order) => ({ id: order.id, createdAt: "2026-09-16T00:00:00Z", status: order.status, customerLatitude: 0, customerLongitude: 0, branch: { name: "Branch" }, items: [{ quantity: 3, product: { name: "Mouse", price: 2500 } }] });
  const db = {
    user: { findUnique: async ({ where }) => users.find((user) => user.id === where.id) ?? null },
    product: { findMany: async () => [{ id: 1 }] },
    branch: { findMany: async ({ where }) => stockQuantity >= where.AND[0].inventories.some.quantity.gte ? [{ id: 1, name: "Branch", latitude: 0, longitude: 0 }] : [] },
    branchInventory: { updateMany: async ({ where, data }) => { if (stockQuantity < where.quantity.gte) return { count: 0 }; stockQuantity -= data.quantity.decrement; return { count: 1 }; } },
    order: {
      groupBy: async () => [],
      create: async ({ data }) => { const order = { id: records.length + 1, ...data }; records.push(order); return { ...safe(order), userId: order.userId }; },
      findMany: async ({ where, select }) => { assert.ok(where.userId); assert.equal(select, customerOrders.customerOrderSelect); return records.filter((order) => order.userId === where.userId).map(safe); },
      findFirst: async ({ where, select }) => { assert.ok(where.userId); assert.equal(select, customerOrders.customerOrderSelect); const order = records.find((order) => order.id === where.id && order.userId === where.userId); return order ? safe(order) : null; },
    },
  };
  db.$transaction = async (callback) => callback(db);
  const auth = load("../lib/auth.ts", { "node:crypto": crypto, "next/headers": { cookies: async () => cookieStore }, "iron-session": { getIronSession }, "next/server": next, "@/lib/db": { prisma: db } }, { AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ORIGIN: origin });
  const stock = load("../lib/order-stock.ts");
  const orders = load("../lib/orders.ts", { "next/server": next, "@/app/generated/prisma/client": prismaTypes, "@/lib/order-stock": stock });
  const deps = { "next/server": next, "@/lib/auth": auth, "@/lib/db": { prisma: db }, "@/lib/orders": orders, "@/lib/customer-orders": customerOrders };
  const list = load("../app/api/my-orders/route.ts", deps);
  const detail = load("../app/api/my-orders/[id]/route.ts", deps);
  const placement = load("../app/api/orders/route.ts", { ...deps, "@/lib/order-stock": stock, "@/lib/allocation": load("../lib/allocation.ts") });
  const managementDetail = load("../app/api/orders/[id]/route.ts", deps);
  const cancellation = load("../app/api/orders/[id]/cancel/route.ts", { ...deps, "@/app/generated/prisma/client": prismaTypes, "@/lib/order-cancellation": { cancelOrder: () => { throw new Error("Customer cancellation must never run"); }, CancellationError: class extends Error {} } });
  const body = { userId: 2, branchId: 999, customerLatitude: 0, customerLongitude: 0, items: [{ productId: 1, quantity: 3 }] };
  const context = { params: Promise.resolve({ id: "1" }) };
  assert.equal((await list.GET(request(null, "GET"))).status, 401);
  assert.equal((await placement.POST(request(body))).status, 401);
  assert.equal(stockQuantity, 10);
  async function signIn(id) { const session = await auth.getSession(); session.userId = id; session.credentialVersion = auth.credentialVersion(password); await session.save(); }
  await signIn(1);
  assert.equal((await placement.POST(request(body, "POST", "https://foreign.test"))).status, 403);
  const placed = await placement.POST(request(body));
  assert.equal(placed.status, 201); assert.equal(placed.body.userId, 1); assert.equal(stockQuantity, 7);
  assert.equal(placed.body.allocation.branchId, 1);
  const mine = await list.GET(request(null, "GET")); assert.equal(mine.body.length, 1); assert.equal(mine.headers["Cache-Control"], "no-store");
  assert.equal(mine.body[0].userId, undefined); assert.equal(mine.body[0].password, undefined); assert.equal(mine.body[0].inventory, undefined);
  assert.equal(customerOrders.orderTotal(mine.body[0]), 7500);
  assert.equal((await detail.GET(request(null, "GET"), context)).status, 200);
  assert.equal((await placement.GET(request(null, "GET"))).status, 403);
  assert.equal((await managementDetail.GET(request(null, "GET"), context)).status, 403);
  assert.equal((await cancellation.POST(request({}), context)).status, 403);
  await signIn(2);
  assert.equal((await list.GET(new Request(`${origin}/api/my-orders?userId=1`))).body.length, 0);
  assert.equal((await detail.GET(request(null, "GET"), context)).status, 404);
  assert.equal((await detail.GET(request(null, "GET"), { params: Promise.resolve({ id: "invalid" }) })).status, 400);
  assert.equal((await cancellation.POST(request({}), context)).status, 403);
  for (const id of [3, 4]) { await signIn(id); assert.equal((await list.GET()).status, 403); assert.equal((await placement.POST(request(body))).status, 403); }
  await signIn(1); (await auth.getSession()).destroy();
  assert.equal((await detail.GET(request(null, "GET"), context)).status, 401);
  assert.equal(records.length, 1); assert.equal(stockQuantity, 7);
});

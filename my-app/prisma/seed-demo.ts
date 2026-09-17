import { randomBytes } from "node:crypto";
import type { Prisma } from "../app/generated/prisma/client";
import { hashPassword } from "../lib/passwords.mjs";
import { allocateOrder } from "../lib/allocation";
import { deductOrderStock } from "../lib/order-stock";
import { completeOrder } from "../lib/order-completion";
import { cancelOrder } from "../lib/order-cancellation";
import { demoProducts, demoBranches, demoStock, demoCustomers, demoOrders, demoInquiries } from "./demo-data";

export function validateSeedTarget(value: string | undefined, allowRemote: boolean) {
  if (!value) throw new Error("Set SEED_DATABASE_URL or DATABASE_URL before seeding.");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("A PostgreSQL URL is required.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !allowRemote) {
    throw new Error("Remote database blocked. Review the target and pass --allow-remote to seed it manually.");
  }
  return value;
}

export async function seedDemo(tx: Prisma.TransactionClient, passwords: readonly string[]) {
  const created = { products: 0, branches: 0, inventories: 0, users: 0, orders: 0, inquiries: 0 };
  const credentials: { email: string; password: string }[] = [];
  const newProductIds = new Set<number>();
  const newBranchIds = new Set<number>();
  // Serialize seed runs because product and branch names are not unique in the schema.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(734021, 1)`;

  // Create demo products.
  const products: { id: number }[] = [];
  for (const data of demoProducts) {
    const matches = await tx.product.findMany({ where: { name: data.name }, select: { id: true } });
    if (matches.length > 1) throw new Error(`Ambiguous demo product: ${data.name}`);
    if (matches.length) products.push(matches[0]);
    else {
      const product = await tx.product.create({ data });
      products.push(product); newProductIds.add(product.id); created.products++;
    }
  }

  // Create demo branches.
  const branches: { id: number }[] = [];
  for (const data of demoBranches) {
    const matches = await tx.branch.findMany({ where: { name: data.name }, select: { id: true } });
    if (matches.length > 1) throw new Error(`Ambiguous demo branch: ${data.name}`);
    if (matches.length) branches.push(matches[0]);
    else {
      const branch = await tx.branch.create({ data });
      branches.push(branch); newBranchIds.add(branch.id); created.branches++;
    }
  }

  // Add inventory for each branch without changing existing quantities.
  for (const [branchIndex, branch] of branches.entries()) {
    for (const [productIndex, product] of products.entries()) {
      const key = { branchId: branch.id, productId: product.id };
      const existing = await tx.branchInventory.findUnique({ where: { branchId_productId: key } });
      // Do not restore inventory removed after an earlier seed run.
      if (!existing && (newBranchIds.has(branch.id) || newProductIds.has(product.id))) {
        await tx.branchInventory.create({ data: { ...key, quantity: demoStock[branchIndex][productIndex] } });
        created.inventories++;
      }
    }
  }

  // Create customer accounts using the application's password hashing method.
  const customers: { id: number }[] = [];
  for (const [index, data] of demoCustomers.entries()) {
    const existing = await tx.user.findUnique({ where: { email: data.email } });
    if (existing) {
      if (existing.name !== data.name || existing.role !== data.role || !existing.password.startsWith("scrypt$")) {
        throw new Error(`Existing account does not match the demo customer: ${data.email}`);
      }
      customers.push(existing);
    } else {
      const password = passwords[index];
      if (!password || password.length < 12 || password.length > 256) throw new Error("Demo passwords must contain 12–256 characters.");
      customers.push(await tx.user.create({ data: { ...data, password: await hashPassword(password) } }));
      credentials.push({ email: data.email, password });
      created.users++;
    }
  }

  // Allocate orders and apply lifecycle transitions using the existing stock rules.
  for (const sample of demoOrders) {
    const userId = customers[sample.customer].id;
    const createdAt = new Date(sample.createdAt);
    if (await tx.order.findFirst({ where: { userId, createdAt } })) continue;
    const items = sample.items.map((item) => ({ productId: products[item.product].id, quantity: item.quantity }));
    const allocation = await allocateOrder(tx, items, sample.latitude, sample.longitude);
    if (!allocation) throw new Error("Insufficient stock for a demo order; the seed will roll back.");
    await deductOrderStock(tx, allocation.branchId, items);
    const order = await tx.order.create({ data: {
      userId, branchId: allocation.branchId, createdAt, status: "ALLOCATED",
      customerLatitude: sample.latitude, customerLongitude: sample.longitude, items: { create: items },
    } });
    if (sample.status === "COMPLETED") await completeOrder(tx, order.id);
    if (sample.status === "CANCELLED") await cancelOrder(tx, order.id);
    created.orders++;
  }

  // Categories are hand-labelled demo data; required confidence is a zero placeholder, not an AI result.
  for (const sample of demoInquiries) {
    const userId = customers[sample.customer].id;
    const createdAt = new Date(sample.createdAt);
    if (await tx.customerInquiry.findFirst({ where: { userId, createdAt } })) continue;
    await tx.customerInquiry.create({ data: {
      userId, createdAt, message: sample.message, predictedCategory: sample.category, confidence: 0, status: "OPEN",
    } });
    created.inquiries++;
  }
  return { created, credentials };
}

export function demoPasswords() {
  return demoCustomers.map(() => process.env.DEMO_CUSTOMER_PASSWORD || randomBytes(24).toString("base64url"));
}

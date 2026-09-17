import { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";
import { StockConflictError } from "@/lib/order-stock";

export const orderInclude = {
  branch: { select: { id: true, name: true } },
  items: { orderBy: { id: "asc" }, include: { product: { select: { id: true, name: true, price: true } } } },
} as const;

export function parseOrderId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isInteger(id) && id <= 2147483647 ? id : null;
}

export function validateOrder(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "Request body must be a JSON object." } as const;
  const { customerLatitude, customerLongitude, items } = body as Record<string, unknown>;
  if (typeof customerLatitude !== "number" || !Number.isFinite(customerLatitude) || customerLatitude < -90 || customerLatitude > 90) return { error: "Customer latitude must be a finite number between -90 and 90." } as const;
  if (typeof customerLongitude !== "number" || !Number.isFinite(customerLongitude) || customerLongitude < -180 || customerLongitude > 180) return { error: "Customer longitude must be a finite number between -180 and 180." } as const;
  const validated = validateOrderItems(items);
  if (validated.error) return validated;
  return { data: { customerLatitude, customerLongitude, items: validated.data } } as const;
}

export function validateOrderItems(items: unknown) {
  if (!Array.isArray(items) || !items.length) return { error: "At least one order item is required." } as const;
  // Reject duplicate products so each stock check covers the full requested quantity.
  const seen = new Set<number>();
  const validated: { productId: number; quantity: number }[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return { error: "Each item must contain a product ID and quantity." } as const;
    const { productId, quantity } = item as Record<string, unknown>;
    if (typeof productId !== "number" || !Number.isInteger(productId) || productId <= 0 || productId > 2147483647) return { error: "Product IDs must be positive integers." } as const;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647) return { error: "Item quantities must be integers between 1 and 2147483647." } as const;
    if (seen.has(productId)) return { error: "Duplicate products are not allowed in an order." } as const;
    seen.add(productId);
    validated.push({ productId, quantity });
  }
  return { data: validated } as const;
}

export function orderError(error: unknown) {
  // Treat stock races and transaction conflicts as a recoverable allocation failure.
  if (error instanceof StockConflictError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
    return NextResponse.json({ error: "Stock changed and the selected branch can no longer fulfill this order." }, { status: 409 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2025")) {
    return NextResponse.json({ error: "A referenced record is no longer available. Refresh and try again." }, { status: 400 });
  }
  return NextResponse.json({ error: "Unable to complete the order request." }, { status: 500 });
}

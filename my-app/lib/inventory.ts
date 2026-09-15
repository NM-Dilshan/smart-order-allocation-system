import { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";

export const inventoryInclude = {
  branch: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, price: true } },
} as const;

export function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

export function parseInventoryId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && validId(id) ? id : null;
}

export function validateQuantity(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." } as const;
  }
  const { quantity } = body as Record<string, unknown>;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) {
    return { error: "Quantity must be an integer between 0 and 2147483647." } as const;
  }
  return { data: { quantity } } as const;
}

export function inventoryError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "This product already exists in the branch inventory." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "Inventory record not found." }, { status: 404 });
    if (error.code === "P2003") return NextResponse.json({ error: "The branch or product is no longer available. Refresh and try again." }, { status: 409 });
    if (error.code === "P2034") return NextResponse.json({ error: "Inventory changed concurrently. Please retry." }, { status: 409 });
  }
  return NextResponse.json({ error: "Unable to complete the inventory request." }, { status: 500 });
}

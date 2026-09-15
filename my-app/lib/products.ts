import { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";

export function parseProductId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 2147483647 ? id : null;
}

export function validateProduct(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." } as const;
  }
  const { name, price } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Name is required and must not be empty." } as const;
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return { error: "Price must be a finite number greater than or equal to zero." } as const;
  }
  return { data: { name: name.trim(), price } } as const;
}

export const deletionConflict = "Cannot delete a product with related inventory or order items.";

export function productError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (error.code === "P2003") return NextResponse.json({ error: deletionConflict }, { status: 409 });
    if (error.code === "P2034") return NextResponse.json({ error: "Product changed concurrently. Please retry." }, { status: 409 });
  }
  return NextResponse.json({ error: "Unable to complete the product request." }, { status: 500 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inventoryError, inventoryInclude, parseInventoryId, validId, validateQuantity } from "@/lib/inventory";

export async function GET(req: Request) {
  const value = new URL(req.url).searchParams.get("branchId");
  const branchId = value === null ? undefined : parseInventoryId(value);
  if (branchId === null) return NextResponse.json({ error: "Invalid branch ID." }, { status: 400 });
  try {
    if (branchId !== undefined && !await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } })) {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }
    return NextResponse.json(await prisma.branchInventory.findMany({
      where: branchId === undefined ? {} : { branchId }, include: inventoryInclude, orderBy: { id: "desc" },
    }));
  } catch (error) { return inventoryError(error); }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateQuantity(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  const { branchId, productId } = body as Record<string, unknown>;
  if (!validId(branchId) || !validId(productId)) return NextResponse.json({ error: "Branch ID and product ID must be positive integers." }, { status: 400 });
  try {
    if (!await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } })) return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    if (!await prisma.product.findUnique({ where: { id: productId }, select: { id: true } })) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const record = await prisma.branchInventory.create({ data: { branchId, productId, ...result.data }, include: inventoryInclude });
    return NextResponse.json(record, { status: 201 });
  } catch (error) { return inventoryError(error); }
}

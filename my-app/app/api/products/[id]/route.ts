import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deletionConflict, parseProductId, productError, validateProduct } from "@/lib/products";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const id = parseProductId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    return productError(error);
  }
}

export async function PUT(req: Request, context: Context) {
  const id = parseProductId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateProduct(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    const product = await prisma.product.update({ where: { id }, data: result.data });
    return NextResponse.json(product);
  } catch (error) {
    return productError(error);
  }
}

export async function DELETE(_req: Request, context: Context) {
  const id = parseProductId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Keep new foreign-key references from racing the relation check and deletion.
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) return "missing";
      const product = await tx.product.findUniqueOrThrow({
        where: { id }, select: { _count: { select: { inventories: true, orderItems: true } } },
      });
      if (product._count.inventories || product._count.orderItems) return "conflict";
      await tx.product.delete({ where: { id } });
      return "deleted";
    }, { isolationLevel: "ReadCommitted" });
    if (outcome === "missing") return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (outcome === "conflict") return NextResponse.json({ error: deletionConflict }, { status: 409 });
    return NextResponse.json({ message: "Product deleted successfully." });
  } catch (error) {
    return productError(error);
  }
}

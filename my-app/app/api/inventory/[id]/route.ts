import { withManagement } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inventoryError, inventoryInclude, parseInventoryId, validateQuantity } from "@/lib/inventory";

type Context = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, context: Context) {
  const id = parseInventoryId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid inventory ID." }, { status: 400 });
  try {
    const record = await prisma.branchInventory.findUnique({ where: { id }, include: inventoryInclude });
    if (!record) return NextResponse.json({ error: "Inventory record not found." }, { status: 404 });
    return NextResponse.json(record);
  } catch (error) { return inventoryError(error); }
}

async function PUTHandler(req: Request, context: Context) {
  const id = parseInventoryId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid inventory ID." }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateQuantity(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    return NextResponse.json(await prisma.branchInventory.update({ where: { id }, data: result.data, include: inventoryInclude }));
  } catch (error) { return inventoryError(error); }
}

async function DELETEHandler(_req: Request, context: Context) {
  const id = parseInventoryId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid inventory ID." }, { status: 400 });
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Serialize removal with quantity updates so stocked inventory is never removed.
      const rows = await tx.$queryRaw<{ quantity: number }[]>`SELECT "quantity" FROM "BranchInventory" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) return "missing";
      if (rows[0].quantity !== 0) return "stocked";
      await tx.branchInventory.delete({ where: { id } });
      return "deleted";
    }, { isolationLevel: "ReadCommitted" });
    if (outcome === "missing") return NextResponse.json({ error: "Inventory record not found." }, { status: 404 });
    if (outcome === "stocked") return NextResponse.json({ error: "Cannot remove inventory with remaining stock. Quantity must be zero." }, { status: 409 });
    return NextResponse.json({ message: "Inventory record removed successfully." });
  } catch (error) { return inventoryError(error); }
}

export const GET = withManagement(GETHandler);
export const PUT = withManagement(PUTHandler);
export const DELETE = withManagement(DELETEHandler);

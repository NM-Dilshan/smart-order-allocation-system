import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allocateOrder } from "@/lib/allocation";
import { orderError, validateOrder } from "@/lib/orders";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateOrder(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    const products = await prisma.product.findMany({ where: { id: { in: result.data.items.map((item) => item.productId) } }, select: { id: true } });
    if (products.length !== result.data.items.length) return NextResponse.json({ error: "One or more products do not exist." }, { status: 400 });
    const bestAvailableBranch = await allocateOrder(prisma, result.data.items, result.data.customerLatitude, result.data.customerLongitude);
    if (bestAvailableBranch) return NextResponse.json({ available: true, bestAvailableBranch });
    const stock = await prisma.branchInventory.groupBy({
      by: ["productId"],
      where: { productId: { in: result.data.items.map((item) => item.productId) } },
      _max: { quantity: true },
    });
    const maximumStock = result.data.items.map((item) => ({
      productId: item.productId,
      requestedQuantity: item.quantity,
      maximumQuantity: stock.find((row) => row.productId === item.productId)?._max.quantity ?? 0,
    }));
    return NextResponse.json({ available: false, message: "No single branch currently has enough stock to fulfill this order.", maximumStock });
  } catch (error) { return orderError(error); }
}

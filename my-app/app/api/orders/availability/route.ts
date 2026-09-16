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
    return NextResponse.json({ available: false, message: "No single branch currently has enough stock to fulfill this order." });
  } catch (error) { return orderError(error); }
}

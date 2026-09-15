import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findEligibleBranches } from "@/lib/allocation";
import { orderError, validateOrderItems } from "@/lib/orders";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  const result = validateOrderItems((body as Record<string, unknown>).items);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    const products = await prisma.product.findMany({ where: { id: { in: result.data.map((item) => item.productId) } }, select: { id: true } });
    if (products.length !== result.data.length) return NextResponse.json({ error: "One or more products do not exist." }, { status: 400 });
    const eligible = await findEligibleBranches(prisma, result.data);
    return NextResponse.json(eligible.length ? { available: true } : { available: false, message: "No single branch currently has enough stock to fulfill this order." });
  } catch (error) { return orderError(error); }
}

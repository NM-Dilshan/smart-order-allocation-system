import { withManagement } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { orderError, orderInclude, parseOrderId } from "@/lib/orders";

async function GETHandler(_req: Request, context: { params: Promise<{ id: string }> }) {
  const id = parseOrderId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(order);
  } catch (error) { return orderError(error); }
}

export const GET = withManagement(GETHandler);

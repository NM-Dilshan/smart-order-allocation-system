import { NextResponse } from "next/server";
import { withCustomer, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { customerOrderSelect } from "@/lib/customer-orders";
import { parseOrderId } from "@/lib/orders";

async function GETHandler(user: CurrentUser, _req: Request, context: { params: Promise<{ id: string }> }) {
  const id = parseOrderId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  const order = await prisma.order.findFirst({ where: { id, userId: user.id }, select: customerOrderSelect });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
}
export const GET = withCustomer(GETHandler);

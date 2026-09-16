import { NextResponse } from "next/server";
import { withCustomer, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { customerOrderSelect } from "@/lib/customer-orders";

async function GETHandler(user: CurrentUser) {
  const orders = await prisma.order.findMany({ where: { userId: user.id }, select: customerOrderSelect, orderBy: { id: "desc" } });
  return NextResponse.json(orders, { headers: { "Cache-Control": "no-store" } });
}
export const GET = withCustomer(GETHandler);

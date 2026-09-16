import { withCustomer, withManagement, type CurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allocateOrder } from "@/lib/allocation";
import { deductOrderStock } from "@/lib/order-stock";
import { orderError, orderInclude, validateOrder } from "@/lib/orders";

async function GETHandler() {
  try {
    return NextResponse.json(await prisma.order.findMany({ orderBy: { id: "desc" }, include: orderInclude }));
  } catch (error) { return orderError(error); }
}

async function POSTHandler(customer: CurrentUser, req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateOrder(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    const order = await prisma.$transaction(async (tx) => {
      const { items, customerLatitude, customerLongitude } = result.data;
      const products = await tx.product.findMany({ where: { id: { in: items.map((item) => item.productId) } }, select: { id: true } });
      if (products.length !== items.length) return null;

      const allocation = await allocateOrder(tx, items, customerLatitude, customerLongitude);
      if (!allocation) return { unavailable: true } as const;

      await deductOrderStock(tx, allocation.branchId, items);

      const created = await tx.order.create({
        data: { customerLatitude, customerLongitude, userId: customer.id, branchId: allocation.branchId, status: "ALLOCATED", items: { create: items } },
        include: orderInclude,
      });
      return { ...created, allocation };
    }, { isolationLevel: "RepeatableRead" });
    if (!order) return NextResponse.json({ error: "One or more products do not exist." }, { status: 400 });
    if ("unavailable" in order) return NextResponse.json({ error: "No branch has sufficient stock to fulfill this order." }, { status: 409 });
    return NextResponse.json(order, { status: 201 });
  } catch (error) { return orderError(error); }
}

export const GET = withManagement(GETHandler);

export const POST = withCustomer(POSTHandler);

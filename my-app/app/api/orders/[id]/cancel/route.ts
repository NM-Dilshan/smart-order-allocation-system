import { withManagement } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseOrderId } from "@/lib/orders";
import { cancelOrder, CancellationError } from "@/lib/order-cancellation";

async function POSTHandler(_req: Request, context: { params: Promise<{ id: string }> }) {
  const id = parseOrderId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const order = await prisma.$transaction((tx) => cancelOrder(tx, id), { isolationLevel: "ReadCommitted" });
    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof CancellationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002", "P2003"].includes(error.code)) {
      return NextResponse.json({ error: "Order or inventory changed concurrently. Refresh and try again." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to cancel the order." }, { status: 500 });
  }
}

export const POST = withManagement(POSTHandler);

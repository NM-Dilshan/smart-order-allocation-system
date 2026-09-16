import { withManagement } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseOrderId } from "@/lib/orders";
import { completeOrder, CompletionError } from "@/lib/order-completion";

async function POSTHandler(_req: Request, context: { params: Promise<{ id: string }> }) {
  const id = parseOrderId((await context.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const order = await prisma.$transaction((tx) => completeOrder(tx, id), { isolationLevel: "ReadCommitted" });
    return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CompletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2025"].includes(error.code)) {
      return NextResponse.json({ error: "Order changed concurrently. Refresh and try again." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to complete the order." }, { status: 500 });
  }
}

export const POST = withManagement(POSTHandler);

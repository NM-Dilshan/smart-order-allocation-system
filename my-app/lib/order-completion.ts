import type { Prisma } from "@/app/generated/prisma/client";
import { orderInclude } from "@/lib/orders";

export class CompletionError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function completeOrder(tx: Prisma.TransactionClient, id: number) {
  // Use the same order-row lock as cancellation. Whichever transition commits
  // first makes the other request observe a terminal status and reject it.
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new CompletionError("Order not found.", 404);
  const order = await tx.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (order.status !== "ALLOCATED") throw new CompletionError("Only allocated orders can be marked as completed.", 409);
  // Stock was deducted at allocation. Completion must never touch inventory.
  return tx.order.update({ where: { id, status: "ALLOCATED" }, data: { status: "COMPLETED" }, include: orderInclude });
}

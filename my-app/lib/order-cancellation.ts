import type { Prisma } from "@/app/generated/prisma/client";
import { orderInclude } from "@/lib/orders";

export class CancellationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function cancelOrder(tx: Prisma.TransactionClient, id: number) {
  // Hold the order lock until restoration and status change commit together.
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new CancellationError("Order not found.", 404);
  const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (order.status === "CANCELLED") throw new CancellationError("This order has already been cancelled.", 409);
  if (order.status === "COMPLETED") throw new CancellationError("Completed orders cannot be cancelled.", 409);
  if (order.status !== "ALLOCATED") throw new CancellationError("Only allocated orders can be cancelled.", 409);
  if (order.branchId === null) throw new CancellationError("This order has no allocated branch.", 409);
  if (!order.items.length || order.items.some((item) => item.quantity <= 0)) throw new CancellationError("This order has invalid items and cannot be cancelled.", 409);

  for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
    // A zero-stock record may have been removed through Inventory Management.
    await tx.branchInventory.upsert({
      where: { branchId_productId: { branchId: order.branchId, productId: item.productId } },
      create: { branchId: order.branchId, productId: item.productId, quantity: item.quantity },
      update: { quantity: { increment: item.quantity } },
    });
  }
  return tx.order.update({ where: { id }, data: { status: "CANCELLED" }, include: orderInclude });
}

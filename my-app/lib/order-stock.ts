import type { Prisma } from "@/app/generated/prisma/client";

export class StockConflictError extends Error {}

export async function deductOrderStock(tx: Prisma.TransactionClient, branchId: number, items: { productId: number; quantity: number }[]) {
  // Stable lock order reduces deadlocks. The conditional update is the final stock check.
  for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
    const result = await tx.branchInventory.updateMany({
      where: { branchId, productId: item.productId, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });
    if (result.count !== 1) throw new StockConflictError();
  }
}

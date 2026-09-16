import type { Prisma } from "@/app/generated/prisma/client";

// Customer reads expose order information only, never other users or inventory.
export const customerOrderSelect = {
  id: true, createdAt: true, status: true, customerLatitude: true, customerLongitude: true,
  branch: { select: { name: true } },
  items: { orderBy: { id: "asc" }, select: { quantity: true, product: { select: { name: true, price: true } } } },
} satisfies Prisma.OrderSelect;

export type CustomerOrder = {
  id: number; createdAt: string; status: string; customerLatitude: number; customerLongitude: number;
  branch: { name: string } | null;
  items: { quantity: number; product: { name: string; price: number } }[];
};

export function orderTotal(order: Pick<CustomerOrder, "items">) {
  return order.items.reduce((total, item) => total + item.product.price * item.quantity, 0);
}

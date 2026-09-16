import type { Metadata } from "next";
import OrderManager from "./order-manager";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Orders | Smart Order Allocation" };
export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (user && isCustomerUser(user)) redirect("/shop");
  return <OrderManager canManage={!!user?.management} canOrder={!!user && isCustomerUser(user)} />;
}

import type { Metadata } from "next";
import OrderManager from "./order-manager";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import AuthControls from "../auth-controls";

export const metadata: Metadata = { title: "Orders | Smart Order Allocation" };
export default async function OrdersPage() {
  const user = await getCurrentUser();
  return <>{user ? <AuthControls name={user.name} management={user.management} /> : <nav aria-label="Account navigation" className="flex flex-wrap gap-4 bg-white px-4 py-3 text-sm text-teal-800 underline"><a href="/login">Customer Login</a><a href="/register">Register</a><a href="/admin/login">Admin / Staff Login</a></nav>}<OrderManager canManage={!!user?.management} canOrder={!!user && isCustomerUser(user)} /></>;
}

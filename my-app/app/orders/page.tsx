import type { Metadata } from "next";
import OrderManager from "./order-manager";
import { getCurrentUser } from "@/lib/auth";
import AuthControls from "../auth-controls";

export const metadata: Metadata = { title: "Orders | Smart Order Allocation" };
export default async function OrdersPage() {
  const user = await getCurrentUser();
  return <>{user?.management ? <AuthControls name={user.name} /> : <a href="/login" className="bg-white px-4 py-3 text-right text-sm text-teal-800 underline">Management Login</a>}<OrderManager canManage={!!user?.management} /></>;
}

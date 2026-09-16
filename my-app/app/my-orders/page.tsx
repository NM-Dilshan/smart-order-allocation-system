import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import AuthControls from "../auth-controls";
import MyOrders from "./my-orders";

export const metadata = { title: "My Orders | Smart Order Allocation" };
export default async function MyOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCustomerUser(user)) redirect(user.management ? "/orders" : "/login");
  return <><AuthControls name={user.name} /><MyOrders /></>;
}

import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import CustomerCart from "./customer-cart";

export const metadata = { title: "Cart | Smart Order Allocation" };
export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCustomerUser(user)) redirect(user.management ? "/products" : "/login");
  return <CustomerCart />;
}

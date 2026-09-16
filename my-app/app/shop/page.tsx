import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import CustomerShop from "./customer-shop";

export const metadata = { title: "Shop | Smart Order Allocation" };
export default async function ShopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCustomerUser(user)) redirect(user.management ? "/products" : "/login");
  return <CustomerShop />;
}

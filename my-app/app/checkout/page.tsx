import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import CustomerCheckout from "./customer-checkout";

export const metadata = { title: "Checkout | Smart Order Allocation" };
export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCustomerUser(user)) redirect(user.management ? "/orders" : "/login");
  return <CustomerCheckout />;
}

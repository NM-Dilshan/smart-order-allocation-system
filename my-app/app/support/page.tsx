import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import SupportForm from "./support-form";

export const metadata = { title: "Customer Support | Smart Order Allocation" };
export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCustomerUser(user)) redirect(user.management ? "/admin/inquiries" : "/login");
  return <SupportForm />;
}

import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import LoginForm from "../login/login-form";

export const metadata = { title: "Register | Smart Order Allocation" };
export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user?.management) redirect("/branches");
  if (user && isCustomerUser(user)) redirect("/orders");
  return <LoginForm registration />;
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "../../login/login-form";

export const metadata = { title: "Admin / Staff Login | Smart Order Allocation" };
export default async function AdminLoginPage() {
  if ((await getCurrentUser())?.management) redirect("/branches");
  return <LoginForm management />;
}

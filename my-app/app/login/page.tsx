import { redirect } from "next/navigation";
import { getCurrentUser, isCustomerUser } from "@/lib/auth";
import LoginForm from "./login-form";

export const metadata = { title: "Customer Login | Smart Order Allocation" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const user = await getCurrentUser();
  if (user?.management) redirect("/branches");
  if (user && isCustomerUser(user)) redirect("/orders");
  return <LoginForm registered={(await searchParams).registered === "1"} />;
}

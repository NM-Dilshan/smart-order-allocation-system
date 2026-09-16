import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./login-form";

export const metadata = { title: "Login | Smart Order Allocation" };
export default async function LoginPage() {
  if ((await getCurrentUser())?.management) redirect("/branches");
  return <LoginForm />;
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AuthControls from "./auth-controls";

export default async function ManagementAccess({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.management) redirect("/admin/login");
  return <><AuthControls name={user.name} management />{children}</>;
}

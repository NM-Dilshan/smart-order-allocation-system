import ManagementAccess from "../management-access";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return <ManagementAccess>{children}</ManagementAccess>;
}

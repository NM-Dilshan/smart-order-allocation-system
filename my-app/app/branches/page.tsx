import type { Metadata } from "next";
import BranchManager from "./branch-manager";

export const metadata: Metadata = { title: "Branches | Smart Order Allocation" };

export default function BranchesPage() {
  return <BranchManager />;
}

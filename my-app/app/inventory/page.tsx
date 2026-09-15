import type { Metadata } from "next";
import InventoryManager from "./inventory-manager";

export const metadata: Metadata = { title: "Inventory | Smart Order Allocation" };

export default function InventoryPage() { return <InventoryManager />; }

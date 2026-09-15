import type { Metadata } from "next";
import OrderManager from "./order-manager";

export const metadata: Metadata = { title: "Orders | Smart Order Allocation" };
export default function OrdersPage() { return <OrderManager />; }

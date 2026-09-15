import type { Metadata } from "next";
import ProductManager from "./product-manager";

export const metadata: Metadata = { title: "Products | Smart Order Allocation" };

export default function ProductsPage() {
  return <ProductManager />;
}

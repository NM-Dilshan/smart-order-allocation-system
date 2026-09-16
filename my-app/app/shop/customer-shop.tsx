"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "../cart/cart-provider";
import { secondary } from "../orders/order-ui";
import ProductCatalog from "./product-catalog";
import { useProducts } from "./use-products";

export default function CustomerShop() {
  const cart = useCart();
  const router = useRouter();
  const { products, loading, error, retry } = useProducts();
  const [feedback, setFeedback] = useState("");
  return <main className="flex-1 bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Shop</h1><p className="mt-2 text-sm text-zinc-600">Browse products. Availability is checked at checkout.</p></div><Link href="/cart" className={`${secondary} min-h-11`}>View Cart ({cart.count})</Link></div>
    <p role="status" className="mb-5 min-h-5 text-sm text-teal-800">{feedback}</p>
    {loading ? <p role="status" className="rounded-xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">Loading products...</p> : error ? <div role="alert" className="space-y-3 text-sm text-red-700"><p>{error}</p><button type="button" className={secondary} onClick={retry}>Retry products</button></div> : <ProductCatalog products={products} onAdd={(product) => {
      if (cart.items.find((item) => item.productId === product.id)?.quantity === 2147483647) { setFeedback("Maximum cart quantity reached."); return; }
      cart.add(product.id); setFeedback(`${product.name} added to cart.`);
    }} onBuy={(product) => { cart.buyNow(product.id); router.push("/checkout"); }} />}
  </div></main>;
}

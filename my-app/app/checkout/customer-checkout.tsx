"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "../cart/cart-provider";
import OrderForm from "../orders/order-form";
import { primary, secondary, type AllocatedOrder } from "../orders/order-ui";

export default function CustomerCheckout() {
  const cart = useCart();
  const router = useRouter();
  const [completed, setCompleted] = useState<AllocatedOrder | null>(null);
  const selection = cart.selection;
  return <main className="flex-1 bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]"><div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
    <h1 className="mb-8 text-3xl font-semibold tracking-tight">{completed ? "Order Placed Successfully" : "Checkout"}</h1>
    {completed ? <section role="status" className="space-y-5 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900"><p className="text-lg font-semibold">Order #{completed.id}</p><div><p className="text-sm">Allocated Branch</p><p className="mt-1 break-words font-semibold">{completed.allocation.branchName}</p></div><div className="flex flex-wrap gap-3"><Link href="/my-orders" className={`${primary} min-h-11`}>View My Orders</Link><Link href="/shop" className={`${secondary} min-h-11`}>Continue Shopping</Link></div></section> : !selection.items.length ? <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-8 text-center"><h2 className="text-xl font-semibold">Your Cart is Empty</h2><Link href="/shop" className={`${primary} min-h-11`}>Continue Shopping</Link></section> : <>
      <p className="mb-6 text-sm text-zinc-600">{selection.mode === "buy-now" ? "Buy Now checkout · Your regular cart is saved." : "Confirm your location to find a branch that can fulfill your complete order."}</p>
      <OrderForm checkoutItems={selection.items} selectionVersion={selection.revision} onClose={() => router.push(selection.mode === "buy-now" ? "/shop" : "/cart")} onComplete={(order) => { cart.complete(selection); setCompleted(order); }} />
    </>}
  </div></main>;
}

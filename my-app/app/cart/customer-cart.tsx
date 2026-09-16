"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "./cart-provider";
import { cartTotal, money } from "./order-summary";
import { input, primary, secondary } from "../orders/order-ui";
import { useProducts } from "../shop/use-products";

export default function CustomerCart() {
  const cart = useCart();
  const router = useRouter();
  const { products, loading, error, retry } = useProducts();
  const unavailable = cart.items.some((item) => !products.some((product) => product.id === item.productId));
  return <main className="flex-1 bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]"><div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
    <h1 className="mb-8 text-3xl font-semibold tracking-tight">Your Cart</h1>
    {!cart.items.length ? <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center"><h2 className="mb-5 text-xl font-semibold">Your Cart is Empty</h2><Link href="/shop" className={`${primary} min-h-11`}>Continue Shopping</Link></div> : <>
      {loading ? <p role="status" className="mb-5 text-sm text-zinc-500">Loading products...</p> : error ? <div role="alert" className="mb-5 space-y-3 text-sm text-red-700"><p>{error}</p><button type="button" className={secondary} onClick={retry}>Retry products</button></div> : <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
        <ul className="divide-y divide-zinc-100">{cart.items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          const name = product?.name ?? "Unavailable product";
          return <li key={item.productId} className="flex min-w-0 flex-wrap justify-between gap-4 py-5 first:pt-0">
            <div className="min-w-0 flex-1 basis-40"><h2 className="break-words font-semibold [overflow-wrap:anywhere]">{name}</h2><p className="mt-2 text-sm text-zinc-500">{product ? `Unit Price: ${money(product.price)}` : "This product is no longer available. Remove it to continue."}</p></div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <div className="flex items-center gap-2">
                <button type="button" className={`${secondary} min-h-11 px-3`} disabled={item.quantity <= 1} aria-label={`Decrease ${name} quantity`} onClick={() => cart.quantity(item.productId, item.quantity - 1)}><Minus size={16} aria-hidden="true" /></button>
                <div className="w-20 shrink-0"><label className="sr-only" htmlFor={`cart-quantity-${item.productId}`}>Quantity for {name}</label><input id={`cart-quantity-${item.productId}`} type="number" min={1} max={2147483647} step={1} value={item.quantity} className={`${input} text-center`} onChange={(event) => cart.quantity(item.productId, Number(event.target.value))} /></div>
                <button type="button" className={`${secondary} min-h-11 px-3`} disabled={item.quantity >= 2147483647} aria-label={`Increase ${name} quantity`} onClick={() => cart.quantity(item.productId, item.quantity + 1)}><Plus size={16} aria-hidden="true" /></button>
              </div>
              <button type="button" className={`${secondary} min-h-11 px-3`} aria-label={`Remove ${name}`} onClick={() => cart.remove(item.productId)}><Trash2 size={16} aria-hidden="true" />Remove</button>
            </div>
            <p className="w-full text-sm text-zinc-600">Subtotal: {product ? money(product.price * item.quantity) : "Unavailable"}</p>
          </li>;
        })}</ul>
        <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-zinc-200 pt-5 font-semibold"><span>Order Total</span><span className="break-all tabular-nums">{money(cartTotal(cart.items, products))}</span></div>
      </div>}
      <div className="mt-6 flex flex-wrap justify-between gap-3"><Link href="/shop" className={`${secondary} min-h-11`}>Continue Shopping</Link><div className="flex flex-wrap gap-3"><button type="button" className={`${secondary} min-h-11`} onClick={cart.clear}>Clear Cart</button><button type="button" className={`${primary} min-h-11`} disabled={loading || !!error || unavailable} onClick={() => {
        if (loading || error || unavailable || !cart.items.length) return;
        cart.checkoutCart(); router.push("/checkout");
      }}>Checkout</button></div></div>
    </>}
  </div></main>;
}

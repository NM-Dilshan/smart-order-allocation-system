import type { Product } from "../orders/order-ui";
import type { CartItem } from "./cart-state";

export const money = (value: number) => `Rs. ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cartTotal = (items: CartItem[], products: Product[]) => items.reduce((sum, item) => sum + (products.find((product) => product.id === item.productId)?.price ?? 0) * item.quantity, 0);

export default function OrderSummary({ items, products, errors = {} }: { items: CartItem[]; products: Product[]; errors?: Record<string, string> }) {
  return <section id="order-items" tabIndex={-1} aria-labelledby="summary-heading" className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
    <h2 id="summary-heading" className="mb-4 text-xl font-semibold">Order Summary</h2>
    <ul className="divide-y divide-zinc-100">{items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return <li id={`order-product-${item.productId}`} tabIndex={-1} key={item.productId} className="flex min-w-0 flex-wrap justify-between gap-3 py-4">
        <div className="min-w-0"><h3 className="break-words font-medium [overflow-wrap:anywhere]">{product?.name ?? "Product no longer available"}</h3>{product && <p className="mt-1 text-sm text-zinc-500">{item.quantity} × {money(product.price)}</p>}</div>
        <p className="break-all text-sm tabular-nums">{product ? money(product.price * item.quantity) : "Unavailable"}</p>
        {errors[`product-${item.productId}`] && <p className="w-full text-sm text-red-700">{errors[`product-${item.productId}`]}</p>}
      </li>;
    })}</ul>
    {errors.items && <p role="alert" className="text-sm text-red-700">{errors.items}</p>}
    <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-zinc-200 pt-5 font-semibold"><span>Total</span><span className="break-all tabular-nums">{money(cartTotal(items, products))}</span></div>
  </section>;
}

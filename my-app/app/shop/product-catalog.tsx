"use client";

import { Package, Plus } from "lucide-react";
import { primary, secondary, type Product } from "../orders/order-ui";
import { money } from "../cart/order-summary";

export default function ProductCatalog({ products, onAdd, onBuy }: {
  products: Product[]; onAdd: (product: Product) => void; onBuy: (product: Product) => void;
}) {
  if (!products.length) return <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">No products are currently available.</p>;
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {products.map((product) => <article key={product.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex h-36 items-center justify-center bg-zinc-100"><Package size={44} strokeWidth={1.25} className="text-zinc-400" aria-hidden="true" /></div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="break-words font-semibold [overflow-wrap:anywhere]">{product.name}</h2>
        <p className="mb-5 mt-2 break-words text-sm text-zinc-600">{money(product.price)}</p>
        <div className="mt-auto space-y-2">
          <button type="button" onClick={() => onAdd(product)} aria-label={`Add ${product.name} to cart`} className={`${primary} min-h-11 w-full`}><Plus size={16} aria-hidden="true" />Add to Cart</button>
          <button type="button" onClick={() => onBuy(product)} aria-label={`Buy ${product.name} now`} className={`${secondary} min-h-11 w-full`}>Buy Now</button>
        </div>
      </div>
    </article>)}
  </div>;
}

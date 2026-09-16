"use client";

import { useEffect, useState } from "react";
import { api, message, primary, secondary } from "../orders/order-ui";
import { orderTotal, type CustomerOrder } from "@/lib/customer-orders";

const money = (value: number) => `Rs. ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MyOrders() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<CustomerOrder[]>("/api/my-orders", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setOrders(data); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-8 [color-scheme:light]"><div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">My Orders</h1><div className="flex gap-3"><button className={secondary} disabled={loading} onClick={() => { setError(""); setLoading(true); setVersion((value) => value + 1); }}>Refresh</button><a href="/orders" className={primary}>Place Order</a></div></div>
    <p className="mb-6 text-sm text-zinc-600">Prices and totals use current product prices. Contact staff if you need to cancel an allocated order.</p>
    {loading ? <p role="status">Loading your orders...</p> : error ? <p role="alert" className="text-red-700">{error}</p> : !orders.length ? <p>No orders yet. Place your first order to see it here.</p> : <div className="space-y-6">{orders.map((order) => <article key={order.id} className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Order #{order.id}</h2><time dateTime={order.createdAt} className="text-sm text-zinc-600">{new Date(order.createdAt).toLocaleString()}</time></div><span className="rounded-md bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">{order.status}</span></div>
      <dl className="my-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Allocated Branch</dt><dd className="break-words font-medium">{order.branch?.name ?? "Awaiting allocation"}</dd></div><div><dt className="text-zinc-500">Delivery coordinates</dt><dd>{order.customerLatitude}, {order.customerLongitude}</dd></div></dl>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-zinc-200 bg-zinc-50"><tr>{["Product", "Quantity", "Unit price", "Subtotal"].map((label) => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{order.items.map((item, index) => <tr key={index} className="border-b border-zinc-100"><td className="px-3 py-3">{item.product.name}</td><td className="px-3 py-3">{item.quantity}</td><td className="whitespace-nowrap px-3 py-3">{money(item.product.price)}</td><td className="whitespace-nowrap px-3 py-3">{money(item.product.price * item.quantity)}</td></tr>)}</tbody></table></div>
      <p className="mt-4 text-right font-semibold">Order Total: {money(orderTotal(order))}</p>
    </article>)}</div>}
  </div></main>;
}

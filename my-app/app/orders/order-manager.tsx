"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Package, Plus, RefreshCw, XCircle } from "lucide-react";
import CancelOrderDialog from "./cancel-order-dialog";
import OrderForm from "./order-form";
import { api, message, primary, secondary, type Order, type AllocatedOrder } from "./order-ui";

export default function OrderManager({ canManage }: { canManage: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<AllocatedOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return (canManage ? api<Order[]>("/api/orders", { signal: controller.signal }) : Promise.resolve([])).then((orders) => {
      if (!controller.signal.aborted) { setOrders(orders); setError(""); }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [canManage]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  function refresh() { setLoading(true); setError(""); void load(); }
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]">
      <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-8"><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white"><Building2 size={22} aria-hidden="true" /></span><span className="text-sm font-semibold sm:text-base">Smart Order Allocation</span></div></header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold sm:text-3xl">Order Management</h1><button className={primary} onClick={() => { setSuccess(null); setCreating(true); }}><Plus size={18} aria-hidden="true" />Create Order</button></div>
        {success && <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="mb-3 font-medium">Order #{success.id} allocated successfully.</p>
          <dl className="grid gap-3 sm:grid-cols-3"><div><dt>Allocated Branch</dt><dd className="break-words font-semibold [overflow-wrap:anywhere]">{success.allocation.branchName}</dd></div><div><dt>Distance</dt><dd className="font-semibold">{success.allocation.distanceKm.toFixed(2)} km</dd></div><div><dt>Branch Workload (before this order)</dt><dd className="font-semibold">{success.allocation.workload} active orders</dd></div></dl>
        </div>}
        {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {cancelSuccess && <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{cancelSuccess}</p>}
        {canManage && <>
        <div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-semibold">All orders</h2><button className={secondary} onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh</button></div>
        <div className="overflow-x-auto" role="region" aria-label="Orders table" tabIndex={0}><table className="w-full min-w-[900px] table-fixed text-left text-sm" aria-busy={loading}>
          <thead className="border-y border-zinc-200 bg-zinc-100 text-xs text-zinc-600"><tr>{["Order ID", "Status", "Products / quantities", "Customer location", "Allocated Branch", "Created"].map((label) => <th scope="col" key={label} className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-200 bg-white">{loading || error || !orders.length ? <tr><td colSpan={6} className="px-4 py-16 text-center text-zinc-500"><Package size={28} className="mx-auto mb-3 text-teal-700" aria-hidden="true" /><span role="status">{loading ? "Loading orders..." : error ? "Orders unavailable." : "No orders yet."}</span></td></tr> : orders.map((order) => <tr key={order.id} className="align-top hover:bg-zinc-50"><th scope="row" className="px-4 py-5 font-mono font-normal">#{order.id}</th><td className="break-words px-4 py-5 text-xs font-medium text-teal-800">{order.status}{order.status === "ALLOCATED" && order.branchId !== null && <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700" onClick={() => { setCancelSuccess(""); setCancelling(order); }}><XCircle size={14} className="shrink-0" aria-hidden="true" />Cancel Order</button>}</td><td className="px-4 py-5"><ul className="space-y-2">{order.items.map((item) => <li key={item.id} className="break-words [overflow-wrap:anywhere]">{item.product.name} <span className="text-zinc-500">x {item.quantity} · {item.product.price}</span></li>)}</ul></td><td className="break-all px-4 py-5 tabular-nums">{order.customerLatitude}<br />{order.customerLongitude}</td><td className="break-words px-4 py-5 [overflow-wrap:anywhere]">{order.branch?.name ?? "Pending Allocation"}</td><td className="px-4 py-5 text-xs text-zinc-600"><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString()}</time></td></tr>)}</tbody>
        </table></div>
        </>}
      </main>
      {creating && <OrderForm onClose={() => setCreating(false)} onComplete={(order) => { setCreating(false); setSuccess(order); refresh(); }} />}
      {cancelling && <CancelOrderDialog order={cancelling} onClose={() => setCancelling(null)} onComplete={(order) => { setCancelling(null); setSuccess(null); setCancelSuccess(`Order #${order.id}: CANCELLED. Stock restored to the allocated branch.`); setOrders((current) => current.map((item) => item.id === order.id ? order : item)); refresh(); }} />}
    </div>
  );
}

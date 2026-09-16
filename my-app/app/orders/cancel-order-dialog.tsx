"use client";

import { useRef, useState } from "react";
import { LoaderCircle, XCircle } from "lucide-react";
import ManagementDialog from "../branches/branch-dialog";
import { api, button, message, secondary, type Order } from "./order-ui";

export default function CancelOrderDialog({ order, onClose, onComplete }: { order: Order; onClose: () => void; onComplete: (order: Order) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function cancel() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { onComplete(await api<Order>(`/api/orders/${order.id}/cancel`, { method: "POST" })); }
    catch (error) { setError(message(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <ManagementDialog title={`Cancel Order #${order.id}`} busy={busy} onClose={onClose}>
    <div className="space-y-4 px-6 py-6"><p className="break-words text-sm text-zinc-700 [overflow-wrap:anywhere]">Cancel this order and restore its stock to {order.branch?.name ?? "the allocated branch"}?</p>{error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
    <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4"><button type="button" className={secondary} onClick={onClose} disabled={busy}>Keep Order</button><button type="button" className={`${button} bg-red-700 text-white hover:bg-red-800`} onClick={() => void cancel()} disabled={busy}>{busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}{busy ? "Cancelling..." : "Cancel Order"}</button></div>
  </ManagementDialog>;
}

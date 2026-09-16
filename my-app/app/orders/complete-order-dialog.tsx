"use client";

import { useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import ManagementDialog from "../branches/branch-dialog";
import { api, message, primary, secondary, type Order } from "./order-ui";

export default function CompleteOrderDialog({ order, onClose, onComplete }: { order: Order; onClose: () => void; onComplete: (order: Order) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function complete() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { onComplete(await api<Order>(`/api/orders/${order.id}/complete`, { method: "POST" })); }
    catch (error) { setError(message(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <ManagementDialog title={`Mark Order #${order.id} as Completed?`} busy={busy} onClose={onClose}>
    <div className="space-y-4 px-6 py-6"><p className="text-sm text-zinc-700">This confirms that the order has been fulfilled. Completed orders cannot be cancelled.</p>{error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
    <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4"><button type="button" className={secondary} onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={primary} onClick={() => void complete()} disabled={busy}>{busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}{busy ? "Completing..." : "Mark as Completed"}</button></div>
  </ManagementDialog>;
}

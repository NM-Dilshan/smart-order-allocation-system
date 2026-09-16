"use client";

import { useEffect, useState } from "react";
import { api, message, secondary } from "../../orders/order-ui";
import { INQUIRY_LIST_LIMIT, type ManagementInquiry } from "@/lib/inquiries";
import ReplyDialog from "./reply-dialog";

export default function InquiryManager() {
  const [inquiries, setInquiries] = useState<ManagementInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [replying, setReplying] = useState<ManagementInquiry | null>(null);
  const [success, setSuccess] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<ManagementInquiry[]>("/api/inquiries", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setInquiries(data); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  const visible = inquiries.filter((inquiry) => filter === "ALL" || inquiry.status === filter);
  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-8 [color-scheme:light]"><div className="mx-auto max-w-6xl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Customer Inquiries</h1><button type="button" className={secondary} disabled={loading} onClick={() => { setError(""); setLoading(true); setVersion((value) => value + 1); }}>Refresh</button></div>
    <p className="mb-6 text-sm text-zinc-600">Latest {INQUIRY_LIST_LIMIT} inquiries. Predicted categories support review; confidence is an uncalibrated model probability. Submissions do not automatically change orders.</p>
    <div className="mb-4 flex gap-2" aria-label="Filter inquiries by status">{(["ALL", "OPEN", "RESOLVED"] as const).map((value) => <button key={value} type="button" className={secondary} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "ALL" ? "All" : value === "OPEN" ? "Open" : "Resolved"}</button>)}</div>
    {success && <p role="status" className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {loading ? <p role="status">Loading inquiries...</p> : error ? <p role="alert" className="text-red-700">{error}</p> : !visible.length ? <p>No inquiries match this view.</p> : <div className="space-y-4">{visible.map((inquiry) => <article key={inquiry.id} className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="break-words font-semibold">{inquiry.user.name}</h2><p className="break-all text-sm text-zinc-600">{inquiry.user.email}</p></div><p className="text-sm text-zinc-500">Submitted: <time dateTime={inquiry.createdAt}>{new Date(inquiry.createdAt).toLocaleString()}</time></p></div>
      <p className="my-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{inquiry.message}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Predicted Category</dt><dd className="font-medium">{inquiry.predictedCategory}</dd></div><div><dt className="text-zinc-500">Confidence</dt><dd className="font-medium">{(inquiry.confidence * 100).toFixed(2)}%</dd></div></dl>
      <p className="mt-4 text-sm font-semibold">Status: {inquiry.status}</p>
      {inquiry.status === "OPEN" ? <button type="button" className={`${secondary} mt-3`} onClick={() => { setSuccess(""); setReplying(inquiry); }}>Reply</button> : <div className="mt-3 rounded-md bg-zinc-50 p-4 text-sm"><h3 className="font-semibold">Support Reply</h3><p className="my-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{inquiry.adminReply}</p><p>Replied By: {inquiry.repliedBy?.email ?? "Staff account unavailable"}</p>{inquiry.repliedAt && <p>Replied At: <time dateTime={inquiry.repliedAt}>{new Date(inquiry.repliedAt).toLocaleString()}</time></p>}</div>}
    </article>)}</div>}
    {replying && <ReplyDialog inquiry={replying} onClose={() => setReplying(null)} onReply={(updated) => { setInquiries((items) => items.map((item) => item.id === updated.id ? updated : item)); setReplying(null); setSuccess(`Reply sent. Inquiry #${updated.id} is RESOLVED.`); setError(""); setVersion((value) => value + 1); }} />}
  </div></main>;
}

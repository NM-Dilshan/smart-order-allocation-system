"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { api, input, message as errorMessage, primary, secondary } from "../orders/order-ui";
import { INQUIRY_LIST_LIMIT, MAX_INQUIRY_LENGTH, validateInquiryMessage, type Inquiry } from "@/lib/inquiries";

export default function SupportForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<Inquiry | null>(null);
  const [history, setHistory] = useState<Inquiry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Inquiry[]>("/api/my-inquiries", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setHistory(data); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setHistoryError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [version]);
  function refreshHistory() { setHistoryError(""); setLoadingHistory(true); setVersion((value) => value + 1); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const text = validateInquiryMessage(message);
    if (!text) { setError(`Enter a message between 1 and ${MAX_INQUIRY_LENGTH} characters.`); return; }
    pending.current = true; setBusy(true); setError(""); setSubmitted(null);
    try {
      const inquiry = await api<Inquiry>("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      setSubmitted(inquiry); setMessage(""); refreshHistory();
    } catch (error) { setError(errorMessage(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-8 [color-scheme:light]"><div className="mx-auto max-w-3xl space-y-8">
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <h1 className="text-2xl font-semibold">Customer Support</h1><p className="mt-2 text-sm text-zinc-600">Send an inquiry for our team to review.</p>
      <form onSubmit={submit} noValidate aria-busy={busy} className="mt-6 space-y-4">
        <div><label htmlFor="support-message" className="mb-2 block text-sm font-medium">How can we help you?</label>
          <textarea id="support-message" value={message} onChange={(event) => { setMessage(event.target.value); setError(""); }} required maxLength={MAX_INQUIRY_LENGTH} rows={5} disabled={busy} className={input} aria-invalid={!!error} aria-describedby={error ? "support-error support-length" : "support-length"} />
          <p id="support-length" className="mt-2 text-sm text-zinc-500">{message.length} / {MAX_INQUIRY_LENGTH} characters</p>
        </div>
        {error && <p id="support-error" role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" className={primary} disabled={busy}>{busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{busy ? "Submitting..." : "Submit Inquiry"}</button>
      </form>
      {submitted && <div role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">Inquiry submitted successfully.</p><p className="mt-2">Category: {submitted.predictedCategory}</p><p className="mt-2">Status: {submitted.status}</p><p className="mt-2">Your inquiry has been saved for review.</p></div>}
    </section>
    <section aria-busy={loadingHistory}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Your recent inquiries</h2><button type="button" className={secondary} disabled={loadingHistory} onClick={refreshHistory}>Refresh</button></div><p className="mb-4 text-sm text-zinc-500">Your latest {INQUIRY_LIST_LIMIT} submissions.</p>
      {loadingHistory ? <p role="status">Loading inquiries...</p> : historyError ? <p role="alert" className="text-sm text-red-700">{historyError}</p> : !history.length ? <p className="text-sm text-zinc-600">No inquiries submitted yet.</p> : <div className="space-y-4">{history.map((inquiry) => <article key={inquiry.id} className="rounded-lg border border-zinc-200 bg-white p-5"><h3 className="font-medium">{inquiry.predictedCategory}</h3><p className="my-3 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{inquiry.message}</p><p className="text-xs text-zinc-500">Submitted: <time dateTime={inquiry.createdAt}>{new Date(inquiry.createdAt).toLocaleString()}</time></p><p className="mt-3 text-sm font-semibold">Status: {inquiry.status}</p>{inquiry.status === "RESOLVED" ? <div className="mt-3 rounded-md bg-zinc-50 p-4 text-sm"><h4 className="font-semibold">Support Reply</h4><p className="my-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{inquiry.adminReply}</p>{inquiry.repliedAt && <p className="text-xs text-zinc-500">Replied: <time dateTime={inquiry.repliedAt}>{new Date(inquiry.repliedAt).toLocaleString()}</time></p>}</div> : <p className="mt-2 text-sm text-zinc-600">Waiting for support response.</p>}</article>)}</div>}
    </section>
  </div></main>;
}

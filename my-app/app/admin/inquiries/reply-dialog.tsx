"use client";

import { useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Send } from "lucide-react";
import ManagementDialog from "../../branches/branch-dialog";
import { api, input, message, primary, secondary } from "../../orders/order-ui";
import { MAX_REPLY_LENGTH, validateInquiryReply, type ManagementInquiry } from "@/lib/inquiries";

export default function ReplyDialog({ inquiry, onClose, onReply }: { inquiry: ManagementInquiry; onClose: () => void; onReply: (inquiry: ManagementInquiry) => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const text = validateInquiryReply(reply);
    if (!text) { setError(`Enter a reply between 1 and ${MAX_REPLY_LENGTH} characters.`); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      onReply(await api<ManagementInquiry>(`/api/inquiries/${inquiry.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply: text }) }));
    } catch (error) { setError(message(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <ManagementDialog title="Reply to Customer Inquiry" busy={busy} onClose={onClose}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <div className="space-y-4 px-6 py-6">
        <div><p className="text-sm font-medium">Customer Message</p><p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{inquiry.message}</p></div>
        <div><label htmlFor="inquiry-reply" className="mb-2 block text-sm font-medium">Reply</label><textarea id="inquiry-reply" value={reply} onChange={(event) => { setReply(event.target.value); setError(""); }} rows={5} maxLength={MAX_REPLY_LENGTH} required disabled={busy} className={input} aria-invalid={!!error} aria-describedby={error ? "reply-help reply-error" : "reply-help"} />
          <p id="reply-help" className="mt-2 text-sm text-zinc-500">{reply.length} / {MAX_REPLY_LENGTH} characters. Sending resolves this inquiry. The reply cannot be changed.</p></div>
        {error && <p id="reply-error" role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4"><button type="button" className={secondary} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={primary} disabled={busy}>{busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{busy ? "Sending..." : "Send Reply"}</button></div>
    </form>
  </ManagementDialog>;
}

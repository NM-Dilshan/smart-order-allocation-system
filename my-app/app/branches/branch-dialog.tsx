"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function BranchDialog({ title, busy, onClose, children }: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby="branch-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 py-5">
        <h2 id="branch-dialog-title" className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" title="Close dialog"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-40">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

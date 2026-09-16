"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AuthControls({ name, management = false }: { name: string; management?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace(management ? "/admin/login" : "/login");
      router.refresh();
    } catch { setError("Unable to sign out. Please retry."); setBusy(false); }
  }
  return <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-zinc-600"><span title={name} className="min-w-0 max-w-40 truncate">{name}</span><button type="button" onClick={() => void logout()} disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"><LogOut size={16} aria-hidden="true" />{busy ? "Signing out..." : "Logout"}</button>{error && <p role="alert" className="w-full text-red-700">{error}</p>}</div>;
}

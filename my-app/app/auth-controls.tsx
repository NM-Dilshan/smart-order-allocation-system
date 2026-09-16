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
  return <div className="flex flex-wrap items-center justify-end gap-4 border-b border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700"><nav aria-label="Main navigation" className="mr-auto flex flex-wrap gap-4 text-teal-800">{(management ? [["/branches", "Branches"], ["/products", "Products"], ["/inventory", "Inventory"], ["/orders", "Order Administration"], ["/admin/inquiries", "Customer Inquiries"]] : [["/orders", "Place Order"], ["/my-orders", "My Orders"], ["/support", "Customer Support"]]).map(([href, label]) => <a key={href} href={href} className="underline">{label}</a>)}</nav><span className="break-all">{name}</span><button type="button" onClick={() => void logout()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-50 disabled:opacity-50"><LogOut size={16} aria-hidden="true" />{busy ? "Signing out..." : "Logout"}</button>{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
}

"use client";

import { useRef, useState, type FormEvent } from "react";
import { Building2, LogIn, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const data = new FormData(event.currentTarget);
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to sign in."); return; }
      router.replace("/branches");
      router.refresh();
    } catch { setError("Unable to sign in. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-zinc-900 [color-scheme:light]"><div className="w-full max-w-sm"><Building2 size={36} className="mb-5 text-teal-700" aria-hidden="true" /><p className="mb-2 text-sm font-medium text-zinc-500">Smart Order Allocation</p><h1 className="mb-8 text-2xl font-semibold">Management Login</h1><form onSubmit={submit} className="space-y-5"><fieldset disabled={busy} className="space-y-5">{([['email', 'Email'], ['password', 'Password']] as const).map(([field, label]) => <div key={field}><label htmlFor={field} className="mb-2 block text-sm font-medium">{label}</label><input id={field} name={field} type={field} required maxLength={field === "email" ? 254 : 256} autoComplete={field === "email" ? "username" : "current-password"} className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:outline-teal-700" /></div>)}</fieldset>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50">{busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}{busy ? "Signing in..." : "Login"}</button></form><a href="/orders" className="mt-6 inline-block text-sm text-teal-800 underline">Customer orders</a></div></main>;
}

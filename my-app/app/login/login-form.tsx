"use client";

import { useRef, useState, type FormEvent } from "react";
import { Building2, LogIn, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginForm({ management = false, registration = false, registered = false }: { management?: boolean; registration?: boolean; registered?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const data = new FormData(event.currentTarget);
    if (registration && data.get("password") !== data.get("confirmPassword")) {
      setError("Passwords must match."); return;
    }
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(registration ? "/api/auth/register" : management ? "/api/auth/admin/login" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password"), ...(registration ? { name: data.get("name"), confirmPassword: data.get("confirmPassword") } : {}) }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? (registration ? "Unable to create your account." : "Unable to sign in.")); return; }
      router.replace(registration ? "/login?registered=1" : management ? "/branches" : "/orders");
      router.refresh();
    } catch { setError(registration ? "Unable to create your account. Please try again." : "Unable to sign in. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 font-sans text-zinc-900 [color-scheme:light]"><div className="w-full max-w-sm"><Building2 size={36} className="mb-5 text-teal-700" aria-hidden="true" /><p className="mb-2 text-sm font-medium text-zinc-500">Smart Order Allocation</p><h1 className="mb-8 text-2xl font-semibold">{registration ? "Create Customer Account" : management ? "Admin / Staff Login" : "Customer Login"}</h1>{registered && <p role="status" className="mb-5 text-sm text-teal-800">Account created. Sign in to place your order.</p>}{registration && <p className="mb-5 text-sm text-zinc-600">Use a password with at least 12 characters.</p>}<form onSubmit={submit} className="space-y-5"><fieldset disabled={busy} className="space-y-5">{((registration ? [["name", "Name"], ["email", "Email"], ["password", "Password"], ["confirmPassword", "Confirm Password"]] : [["email", "Email"], ["password", "Password"]]) as string[][]).map(([field, label]) => <div key={field}><label htmlFor={field} className="mb-2 block text-sm font-medium">{label}</label><input id={field} name={field} type={field === "email" ? "email" : field === "name" ? "text" : "password"} required minLength={registration && field.toLowerCase().includes("password") ? 12 : undefined} maxLength={field === "email" ? 254 : field === "name" ? 100 : 256} autoComplete={field === "email" ? "username" : field === "name" ? "name" : registration ? "new-password" : "current-password"} className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:outline-teal-700" /></div>)}</fieldset>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50">{busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}{busy ? "Please wait..." : registration ? "Register" : "Login"}</button></form><nav aria-label="Account navigation" className="mt-6 flex flex-wrap gap-4 text-sm text-teal-800 underline"><a href="/login">Customer Login</a><a href="/register">Register</a><a href="/admin/login">Admin / Staff Login</a></nav></div></main>;
}

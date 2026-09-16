"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import AuthControls from "./auth-controls";

type HeaderUser = { name: string; email: string; role: string; management: boolean; customer: boolean };

export default function ApplicationHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  const menuButton = useRef<HTMLButtonElement>(null);
  const open = lastPath === pathname && openPath === pathname;
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpenPath(null);
  }
  const links = user?.management
    ? [["/branches", "Branches"], ["/products", "Products"], ["/inventory", "Inventory"], ["/orders", "Orders"], ["/admin/inquiries", "Inquiries"]]
    : user?.customer
      ? [["/orders", "Place Order"], ["/my-orders", "My Orders"], ["/support", "Support"]]
      : user ? [] : [["/login", "Customer Login"], ["/register", "Register"]];

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-zinc-200 bg-white text-zinc-900 shadow-sm" onKeyDown={(event) => {
      if (event.key === "Escape" && open) { setOpenPath(null); menuButton.current?.focus(); }
    }}>
      <div className="mx-auto flex min-h-18 max-w-7xl flex-wrap items-center gap-x-6 px-4 py-3 sm:px-6 lg:px-8">
        <Link href={user?.management ? "/branches" : "/orders"} onClick={() => setOpenPath(null)} className="shrink-0 rounded-md text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Smart Order</Link>
        {user?.management && <span className="shrink-0 rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold tracking-wide text-teal-800">{user.role}</span>}
        <button ref={menuButton} type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="application-navigation" onClick={() => setOpenPath(open ? null : pathname)} className="ml-auto inline-flex size-10 items-center justify-center rounded-lg border border-zinc-200 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 xl:hidden">
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <div id="application-navigation" className={`${open ? "flex" : "hidden"} w-full min-w-0 flex-col gap-4 border-t border-zinc-100 pt-4 mt-3 xl:mt-0 xl:flex xl:w-auto xl:flex-1 xl:flex-row xl:items-center xl:border-0 xl:pt-0`}>
          <nav aria-label="Main navigation" className={`flex min-w-0 flex-col gap-1 xl:flex-row ${!user ? "xl:ml-auto" : ""}`}>
            {links.map(([href, label]) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenPath(null)} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${active ? "bg-teal-50 text-teal-800" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}>{label}</Link>;
            })}
          </nav>
          {user && <div className="min-w-0 border-t border-zinc-100 pt-4 xl:ml-auto xl:border-0 xl:pt-0"><AuthControls name={user.name || user.email} management={user.management} /></div>}
        </div>
      </div>
    </header>
  );
}

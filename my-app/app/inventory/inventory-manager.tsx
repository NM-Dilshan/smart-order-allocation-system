"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, LoaderCircle, Package, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import ManagementDialog from "../branches/branch-dialog";

type Branch = { id: number; name: string };
type Product = { id: number; name: string; price: number };
type Inventory = { id: number; branchId: number; productId: number; quantity: number; branch: Branch; product: Product };
type Editor = { kind: "add" } | { kind: "edit" | "delete"; record: Inventory };
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-teal-700 text-white hover:bg-teal-800`;
const secondary = `${button} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`;
const input = "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:outline-teal-700 disabled:bg-zinc-100";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { cache: "no-store", ...options }); }
  catch { throw new Error("Unable to connect to the server. Please try again."); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The request could not be completed. Please try again.");
  if (body === null) throw new Error("The server returned an invalid response. Please retry.");
  return body as T;
}
const message = (error: unknown) => error instanceof Error ? error.message : "Unable to complete the request.";

export default function InventoryManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ready, setReady] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [branchId, setBranchId] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<Branch[]>("/api/branches", { signal: controller.signal }), api<Product[]>("/api/products", { signal: controller.signal })])
      .then(([branches, products]) => {
        if (!controller.signal.aborted) { setBranches(branches); setProducts(products); setReady(true); }
      }).catch((error: unknown) => { if (!controller.signal.aborted) setCatalogError(message(error)); });
    return () => controller.abort();
  }, [version]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]">
      <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-8"><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white"><Building2 size={22} aria-hidden="true" /></span><span className="text-sm font-semibold sm:text-base">Smart Order Allocation</span></div></header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="mb-8 text-2xl font-semibold sm:text-3xl">Branch Inventory Management</h1>
        {catalogError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-800"><span>{catalogError}</span><button className={secondary} onClick={() => { setCatalogError(""); setVersion((v) => v + 1); }}>Retry</button></div> : !ready ? <p role="status" className="text-zinc-500">Loading branches and products...</p> : (
          <>
            <div className="mb-8 max-w-md"><label htmlFor="inventory-branch" className="mb-2 block text-sm font-medium">Branch</label><select id="inventory-branch" className={input} value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select a branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            {!branches.length ? <p className="text-sm text-zinc-600">No branches available. <a href="/branches" className="font-medium text-teal-800 underline">Manage branches</a></p> : branchId ? <BranchInventory key={branchId} branchId={Number(branchId)} products={products} /> : <div className="border-y border-zinc-200 py-16 text-center text-zinc-500"><Package size={32} className="mx-auto mb-3 text-teal-700" aria-hidden="true" />No branch selected</div>}
          </>
        )}
      </main>
    </div>
  );
}

function BranchInventory({ branchId, products }: { branchId: number; products: Product[] }) {
  const [records, setRecords] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return api<Inventory[]>(`/api/inventory?branchId=${branchId}`, { signal: controller.signal }).then((records) => {
      if (!controller.signal.aborted) { setRecords(records); setError(""); }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [branchId]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  function refresh() { setLoading(true); setError(""); void load(); }
  function open(editor: Editor) { setSuccess(""); setEditor(editor); }
  const available = products.filter((product) => !records.some((record) => record.productId === product.id));

  return (
    <section aria-label="Branch inventory">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Inventory</h2><div className="flex gap-2"><button className={secondary} onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh</button><button className={primary} onClick={() => open({ kind: "add" })} disabled={loading || !!error || !available.length}><Plus size={16} aria-hidden="true" />Add Product</button></div></div>
      {success && <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{success}</p>}
      {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {!loading && !error && !available.length && <p className="mb-4 text-sm text-zinc-600">{products.length ? "All products are already in this branch inventory." : <>No products available. <a href="/products" className="text-teal-800 underline">Manage products</a></>}</p>}
      <div className="overflow-x-auto" role="region" aria-label="Inventory table" tabIndex={0}>
        <table className="w-full min-w-[640px] table-fixed text-left text-sm" aria-busy={loading}>
          <thead className="border-y border-zinc-200 bg-zinc-100 text-xs text-zinc-600"><tr>{["Product", "Price", "Quantity", "Stock status", "Actions"].map((label) => <th key={label} scope="col" className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {loading || error || !records.length ? <tr><td colSpan={5} className="px-4 py-16 text-center text-zinc-500"><span role="status">{loading ? "Loading inventory..." : error ? "Inventory unavailable." : "No inventory for this branch yet."}</span></td></tr> : records.map((record) => <tr key={record.id} className="hover:bg-zinc-50"><th scope="row" className="break-words px-4 py-5 font-medium [overflow-wrap:anywhere]">{record.product.name}</th><td className="break-all px-4 py-5 tabular-nums">{record.product.price}</td><td className="px-4 py-5 tabular-nums">{record.quantity}</td><td className={`px-4 py-5 text-xs font-medium ${record.quantity ? "text-emerald-800" : "text-red-700"}`}>{record.quantity ? "In Stock" : "Out of Stock"}</td><td className="px-4 py-3"><div className="flex gap-1"><button className={`${button} px-2 hover:bg-teal-50`} title="Update quantity" aria-label={`Update quantity for ${record.product.name}`} onClick={() => open({ kind: "edit", record })}><Pencil size={17} aria-hidden="true" /></button><button className={`${button} px-2 hover:bg-red-50 hover:text-red-700`} title="Remove inventory" aria-label={`Remove ${record.product.name}`} onClick={() => open({ kind: "delete", record })}><Trash2 size={17} aria-hidden="true" /></button></div></td></tr>)}
          </tbody>
        </table>
      </div>
      {editor && <InventoryEditor editor={editor} branchId={branchId} products={available} onClose={() => setEditor(null)} onComplete={(text) => { setEditor(null); setSuccess(text); refresh(); }} />}
    </section>
  );
}

function InventoryEditor({ editor, branchId, products, onClose, onComplete }: { editor: Editor; branchId: number; products: Product[]; onClose: () => void; onComplete: (text: string) => void }) {
  const record = editor.kind === "add" ? null : editor.record;
  const removing = editor.kind === "delete";
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(record ? String(record.quantity) : "");
  const [errors, setErrors] = useState<{ productId?: string; quantity?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const validation: typeof errors = {};
    if (!removing) {
      if (!record && !products.some((product) => product.id === Number(productId))) validation.productId = "Select an available product.";
      if (!quantity.trim() || !Number.isInteger(Number(quantity)) || Number(quantity) < 0 || Number(quantity) > 2147483647) validation.quantity = "Enter a whole number between 0 and 2147483647.";
    }
    setErrors(validation);
    const first = Object.keys(validation)[0];
    if (first) { document.getElementById(`inventory-${first}`)?.focus(); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      await api(record ? `/api/inventory/${record.id}` : "/api/inventory", {
        method: removing ? "DELETE" : record ? "PUT" : "POST",
        ...(!removing && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(record ? { quantity: Number(quantity) } : { branchId, productId: Number(productId), quantity: Number(quantity) }) }),
      });
      onComplete(removing ? "Inventory record removed successfully." : record ? "Quantity updated successfully." : "Product added to inventory successfully.");
    } catch (error) { setError(message(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <ManagementDialog title={removing ? "Remove inventory" : record ? "Update quantity" : "Add Product"} busy={busy} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="space-y-5 px-6 py-6">
          {record && <p className="break-words text-sm text-zinc-700 [overflow-wrap:anywhere]">{removing ? `Remove ${record.product.name} from this branch? Only zero-stock records can be removed.` : record.product.name}</p>}
          {!removing && <fieldset disabled={busy} className="space-y-5">
            {!record && <div><label htmlFor="inventory-productId" className="mb-2 block text-sm font-medium">Product</label><select id="inventory-productId" className={input} required value={productId} onChange={(event) => setProductId(event.target.value)} aria-invalid={!!errors.productId} aria-describedby={errors.productId ? "product-error" : undefined}><option value="">Select a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{errors.productId && <p id="product-error" className="mt-2 text-sm text-red-700">{errors.productId}</p>}</div>}
            <div><label htmlFor="inventory-quantity" className="mb-2 block text-sm font-medium">Quantity</label><input id="inventory-quantity" className={input} type="number" min={0} max={2147483647} step={1} required value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={!!errors.quantity} aria-describedby={errors.quantity ? "quantity-error" : undefined} />{errors.quantity && <p id="quantity-error" className="mt-2 text-sm text-red-700">{errors.quantity}</p>}</div>
          </fieldset>}
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4"><button type="button" className={secondary} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy} className={removing ? `${button} bg-red-700 text-white hover:bg-red-800` : primary}>{busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : removing ? <Trash2 size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}{busy ? "Saving..." : removing ? "Remove inventory" : record ? "Save quantity" : "Add Product"}</button></div>
      </form>
    </ManagementDialog>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent, type SetStateAction } from "react";
import { CheckCircle2, LoaderCircle, MapPin, Plus, Trash2 } from "lucide-react";
import ManagementDialog from "../branches/branch-dialog";
import { api, input, message, primary, secondary, type AllocatedOrder, type Product } from "./order-ui";

import type { Allocation } from "@/lib/allocation";
import OrderSummary from "../cart/order-summary";
import type { CartItem } from "../cart/cart-state";

type Row = { key: number; productId: string; quantity: string };
type Availability = { available: boolean; bestAvailableBranch?: Allocation; message?: string };

export default function OrderForm({ onClose, onComplete, checkoutItems, selectionVersion = 0 }: { onClose: () => void; onComplete: (order: AllocatedOrder) => void; checkoutItems?: CartItem[]; selectionVersion?: number }) {
  const checkout = checkoutItems !== undefined;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [version, setVersion] = useState(0);
  const [location, setLocationState] = useState({ latitude: "", longitude: "" });
  const [editableRows, setRowsState] = useState<Row[]>([{ key: 0, productId: "", quantity: "1" }]);
  const rows = checkoutItems?.map((item) => ({ key: item.productId, productId: String(item.productId), quantity: String(item.quantity) })) ?? editableRows;
  const nextKey = useRef(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [availability, setAvailability] = useState<(Availability & { signature: string }) | null>(null);
  const signature = JSON.stringify({ location, items: rows.map(({ productId, quantity }) => ({ productId, quantity })), selectionVersion });
  const available = availability?.signature === signature && availability.available && !!availability.bestAvailableBranch;
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const locationPending = useRef(false);
  const locationRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    api<Product[]>("/api/products", { signal: controller.signal }).then((products) => { if (!controller.signal.aborted) setProducts(products); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setCatalogError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  useEffect(() => () => { locationRequest.current += 1; }, []);

  function currentLocation() {
    if (pending.current || locationPending.current) return;
    setLocationError(""); setLocationStatus("");
    if (!navigator.geolocation) { setLocationError("Geolocation is not supported by this browser. Enter coordinates manually."); return; }
    const id = ++locationRequest.current;
    locationPending.current = true; setLocating(true);
    function finish() {
      if (id !== locationRequest.current) return false;
      locationPending.current = false; setLocating(false); return true;
    }
    try {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (!finish()) return;
        setLocation({ latitude: String(coords.latitude), longitude: String(coords.longitude) });
        setErrors((current) => { const updated = { ...current }; delete updated.latitude; delete updated.longitude; return updated; });
        setLocationStatus("Current location added.");
      }, (error) => {
        if (!finish()) return;
        const messages: Record<number, string> = {
          1: "Location permission denied. Allow access in browser settings or enter coordinates manually.",
          2: "Your location is unavailable. Try again or enter coordinates manually.",
          3: "Getting your location timed out. Try again or enter coordinates manually.",
        };
        setLocationError(messages[error.code] ?? "Unable to get your location. Enter coordinates manually.");
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    } catch { if (finish()) setLocationError("Unable to access your location. Enter coordinates manually."); }
  }

  function setLocation(value: SetStateAction<typeof location>) {
    setAvailability(null);
    setLocationState(value);
  }

  function setRows(value: SetStateAction<Row[]>) {
    setAvailability(null);
    setRowsState(value);
  }

  function changeRow(key: number, field: "productId" | "quantity", value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || locationPending.current || loading || catalogError) return;
    const validation: Record<string, string> = {};
    for (const [field, limit] of [["latitude", 90], ["longitude", 180]] as const) {
      if (!location[field].trim() || !Number.isFinite(Number(location[field])) || Number(location[field]) < -limit || Number(location[field]) > limit) validation[field] = `Enter a number between -${limit} and ${limit}.`;
    }
    if (!rows.length) validation.items = "Add at least one product.";
    const seen = new Set<string>();
    for (const row of rows) {
      if (!products.some((product) => product.id === Number(row.productId)) || seen.has(row.productId)) validation[`product-${row.key}`] = "Select a different available product.";
      seen.add(row.productId);
      if (!row.quantity.trim() || !Number.isInteger(Number(row.quantity)) || Number(row.quantity) < 1 || Number(row.quantity) > 2147483647) validation[`quantity-${row.key}`] = "Enter a whole number between 1 and 2147483647.";
    }
    setErrors(validation);
    const first = Object.keys(validation)[0];
    if (first) { document.getElementById(`order-${first}`)?.focus(); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      if (!available) {
        const result = await api<Availability>("/api/orders/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerLatitude: Number(location.latitude), customerLongitude: Number(location.longitude), items: rows.map((row) => ({ productId: Number(row.productId), quantity: Number(row.quantity) })) }) });
        setAvailability({ ...result, signature });
        return;
      }
      const order = await api<AllocatedOrder>("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerLatitude: Number(location.latitude), customerLongitude: Number(location.longitude), items: rows.map((row) => ({ productId: Number(row.productId), quantity: Number(row.quantity) })) }) });
      onComplete(order);
    } catch (error) { setAvailability(null); setError(message(error)); }
    finally { pending.current = false; setBusy(false); }
  }

  const form = (
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className={checkout ? "flex flex-col gap-6" : "space-y-6 px-6 py-6"}>
          {checkout && (loading ? <p role="status" className="text-sm text-zinc-500">Loading order summary...</p> : !catalogError && <OrderSummary items={checkoutItems} products={products} errors={errors} />)}
          <fieldset disabled={busy} className={checkout ? "space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6" : "space-y-4"}><legend className="mb-3 text-sm font-semibold">Customer Location</legend>
            <button type="button" className={secondary} onClick={currentLocation} disabled={locating}>{locating ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}{locating ? "Getting location..." : "Use Current Location"}</button>
            <p role="status" className="text-sm text-teal-800">{locating ? "Getting location..." : locationStatus}</p>
            {locationError && <p role="alert" className="text-sm text-red-700">{locationError}</p>}
            {(["latitude", "longitude"] as const).map((field) => <div key={field}><label htmlFor={`order-${field}`} className="mb-2 block text-sm font-medium">{field === "latitude" ? "Latitude" : "Longitude"}</label><input id={`order-${field}`} className={input} type="number" step="any" min={field === "latitude" ? -90 : -180} max={field === "latitude" ? 90 : 180} required value={location[field]} onChange={(event) => setLocation((current) => ({ ...current, [field]: event.target.value }))} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined} />{errors[field] && <p id={`${field}-error`} className="mt-2 text-sm text-red-700">{errors[field]}</p>}</div>)}
          </fieldset>
          {!checkout && <fieldset disabled={busy || loading || !!catalogError} className="min-w-0 space-y-5"><legend className="mb-3 text-sm font-semibold">Order Items</legend>
            {loading ? <p role="status" className="text-sm text-zinc-500">Loading products...</p> : !catalogError && !products.length ? <p className="text-sm text-zinc-600">No products available.</p> : rows.map((row, index) => {
              const product = products.find((product) => product.id === Number(row.productId));
              return <div key={row.key} className="space-y-3 border-b border-zinc-200 pb-5"><div><label htmlFor={`order-product-${row.key}`} className="mb-2 block text-sm font-medium">Product {index + 1}</label><select id={`order-product-${row.key}`} className={input} required value={row.productId} onChange={(event) => changeRow(row.key, "productId", event.target.value)} aria-invalid={!!errors[`product-${row.key}`]} aria-describedby={errors[`product-${row.key}`] ? `product-error-${row.key}` : undefined}><option value="">Select a product</option>{products.filter((product) => String(product.id) === row.productId || !rows.some((other) => other.productId === String(product.id))).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{product && <p className="mt-2 break-all text-sm text-zinc-500">Price: {product.price}</p>}{errors[`product-${row.key}`] && <p id={`product-error-${row.key}`} className="mt-2 text-sm text-red-700">{errors[`product-${row.key}`]}</p>}</div><div className="flex items-end gap-3"><div className="min-w-0 flex-1"><label htmlFor={`order-quantity-${row.key}`} className="mb-2 block text-sm font-medium">Quantity</label><input id={`order-quantity-${row.key}`} className={input} type="number" min={1} max={2147483647} step={1} required value={row.quantity} onChange={(event) => changeRow(row.key, "quantity", event.target.value)} aria-invalid={!!errors[`quantity-${row.key}`]} aria-describedby={errors[`quantity-${row.key}`] ? `quantity-error-${row.key}` : undefined} /></div><button type="button" className={`${secondary} px-3`} title="Remove item" aria-label={`Remove item ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 size={17} aria-hidden="true" /></button></div>{errors[`quantity-${row.key}`] && <p id={`quantity-error-${row.key}`} className="text-sm text-red-700">{errors[`quantity-${row.key}`]}</p>}</div>;
            })}
            <button id="order-items" type="button" className={secondary} disabled={rows.length >= products.length} onClick={() => setRows((current) => [...current, { key: nextKey.current++, productId: "", quantity: "1" }])}><Plus size={16} aria-hidden="true" />Add item</button>
            {errors.items && <p role="alert" className="text-sm text-red-700">{errors.items}</p>}
          </fieldset>}
          {catalogError && <div role="alert" className="space-y-3 text-sm text-red-700"><p>{catalogError}</p><button type="button" className={secondary} onClick={() => { setLoading(true); setCatalogError(""); setVersion((v) => v + 1); }}>Retry products</button></div>}
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {availability?.signature === signature && <div role="status" className={`rounded-md border p-3 text-sm ${available ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
            <p>{available ? "Available for Allocation" : availability.message ?? "No single branch currently has enough stock to fulfill this order."}</p>
            {available && availability.bestAvailableBranch && <div className="mt-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide">Best Available Branch</h3>
              <p className="break-words text-lg font-semibold">{availability.bestAvailableBranch.branchName}</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt>Distance</dt><dd className="font-semibold">{availability.bestAvailableBranch.distanceKm.toFixed(2)} km</dd></div>
                <div><dt>Current Workload</dt><dd className="font-semibold">{availability.bestAvailableBranch.workload} active {availability.bestAvailableBranch.workload === 1 ? "order" : "orders"}</dd></div>
              </dl>
              <p className="flex items-center gap-2"><CheckCircle2 size={16} aria-hidden="true" />Can fulfill all requested items</p>
              <p>Preview only. Stock and workload are checked again when you place your order; the allocated branch may change.</p>
            </div>}

          </div>}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4"><button type="button" className={`${secondary} min-h-11`} onClick={onClose} disabled={busy || (checkout && locating)}>{checkout ? "Back" : "Cancel"}</button><button type="submit" className={`${primary} min-h-11`} disabled={busy || locating || loading || !!catalogError || !products.length || !rows.length}>{busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}{busy ? available ? "Placing order..." : "Checking availability..." : available ? "Place Order" : "Check Availability"}</button></div>
      </form>
  );
  return checkout ? form : <ManagementDialog title="Create Order" busy={busy} onClose={onClose}>{form}</ManagementDialog>;
}

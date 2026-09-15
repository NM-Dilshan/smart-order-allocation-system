"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, CircleAlert, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import BranchDialog from "./branch-dialog";

type Branch = { id: number; name: string; latitude: number; longitude: number };
type Values = { name: string; latitude: string; longitude: string };
type Editor = { kind: "add" } | { kind: "edit"; branch: Branch } | { kind: "delete"; branch: Branch };
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-teal-700 text-white hover:bg-teal-800`;
const secondary = `${button} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(typeof body?.error === "string" ? body.error : "The request could not be completed. Please try again.", response.status);
  }
  if (body === null) throw new Error("The server returned an invalid response. Please try again.");
  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Unable to connect to the server. Please try again.";
}

export default function BranchManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return api<Branch[]>("/api/branches", { signal: controller.signal }).then((data) => {
      if (!Array.isArray(data)) throw new Error("Invalid branch list");
      if (!controller.signal.aborted) {
        setBranches(data);
        setError("");
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  function refresh() {
    setLoading(true);
    setError("");
    void load();
  }

  function open(value: Editor) { setSuccess(""); setEditor(value); }
  function completed(message: string) {
    setEditor(null);
    setSuccess(message);
    refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-8">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white"><Building2 size={22} aria-hidden="true" /></span>
          <span className="text-sm font-semibold sm:text-base">Smart Order Allocation</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold sm:text-3xl">Branch Management</h1>
          <button className={primary} onClick={() => open({ kind: "add" })}><Plus size={18} aria-hidden="true" />Add Branch</button>
        </div>

        {success && <div role="status" className="mb-5 flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />{success}</div>}
        {error && <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"><CircleAlert size={18} className="shrink-0" aria-hidden="true" /><span className="flex-1">{error}</span><button className={secondary} onClick={refresh}>Retry</button></div>}

        <section aria-label="Branches">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold">All branches</h2>
            <button className={secondary} onClick={refresh} disabled={loading} title="Refresh branches">
              <RefreshCw size={16} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" /><span>Refresh</span>
            </button>
          </div>
          <div className="overflow-x-auto" role="region" aria-label="Branch table" tabIndex={0}>
            <table className="w-full min-w-[640px] table-fixed text-left text-sm" aria-busy={loading}>
              <thead className="border-b border-zinc-200 bg-zinc-100 text-xs text-zinc-600">
                <tr><th scope="col" className="w-24 px-4 py-4 font-medium">Branch ID</th><th scope="col" className="px-4 py-4 font-medium">Branch Name</th><th scope="col" className="w-32 px-4 py-4 font-medium">Latitude</th><th scope="col" className="w-32 px-4 py-4 font-medium">Longitude</th><th scope="col" className="w-28 px-4 py-4 text-right font-medium">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {loading ? <tr><td colSpan={5} className="px-4 py-16 text-center text-zinc-500"><span role="status" className="inline-flex items-center gap-2"><LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />Loading branches...</span></td></tr> : error ? <tr><td colSpan={5} className="px-4 py-16 text-center text-zinc-500">Branch list unavailable.</td></tr> : branches.length === 0 ? <tr><td colSpan={5} className="px-4 py-16 text-center"><MapPin size={32} className="mx-auto mb-3 text-teal-700" aria-hidden="true" /><p className="font-medium">No branches yet</p><button className={`${primary} mt-5`} onClick={() => open({ kind: "add" })}><Plus size={16} aria-hidden="true" />Add Branch</button></td></tr> : branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-5 font-mono text-xs text-zinc-500">#{branch.id}</td>
                    <th scope="row" className="break-words px-4 py-5 font-medium [overflow-wrap:anywhere]">{branch.name}</th>
                    <td className="break-all px-4 py-5 tabular-nums text-zinc-600">{branch.latitude}</td>
                    <td className="break-all px-4 py-5 tabular-nums text-zinc-600">{branch.longitude}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      <button onClick={() => open({ kind: "edit", branch })} aria-label={`Edit ${branch.name}`} title="Edit branch" className="flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700"><Pencil size={17} aria-hidden="true" /></button>
                      <button onClick={() => open({ kind: "delete", branch })} aria-label={`Delete ${branch.name}`} title="Delete branch" className="flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-700"><Trash2 size={17} aria-hidden="true" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {editor && <BranchEditor editor={editor} onClose={() => setEditor(null)} onComplete={completed} onMissing={refresh} />}
    </div>
  );
}

function BranchEditor({ editor, onClose, onComplete, onMissing }: {
  editor: Editor; onClose: () => void; onComplete: (message: string) => void; onMissing: () => void;
}) {
  const branch = editor.kind === "add" ? null : editor.branch;
  const [values, setValues] = useState<Values>({ name: branch?.name ?? "", latitude: branch ? String(branch.latitude) : "", longitude: branch ? String(branch.longitude) : "" });
  const [errors, setErrors] = useState<Partial<Values>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const locationRequest = useRef(0);
  const locationPending = useRef(false);
  const isDelete = editor.kind === "delete";

  useEffect(() => () => {
    // Geolocation cannot be cancelled; ignore callbacks after the form closes.
    locationRequest.current += 1;
  }, []);

  function useCurrentLocation() {
    if (pending.current || locationPending.current) return;
    setLocationError("");
    setLocationStatus("");
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser. Enter coordinates manually.");
      return;
    }

    const requestId = ++locationRequest.current;
    locationPending.current = true;
    setLocating(true);

    function finish() {
      if (requestId !== locationRequest.current) return false;
      locationPending.current = false;
      setLocating(false);
      return true;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (!finish()) return;
          setValues((current) => ({ ...current, latitude: String(coords.latitude), longitude: String(coords.longitude) }));
          setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
          setLocationStatus("Current location added.");
        },
        (error) => {
          if (!finish()) return;
          const messages: Record<number, string> = {
            1: "Location permission denied. Allow location access in your browser settings or enter coordinates manually.",
            2: "Your location is unavailable. Try again or enter coordinates manually.",
            3: "Getting your location timed out. Try again or enter coordinates manually.",
          };
          setLocationError(messages[error.code] ?? "Unable to get your location. Enter coordinates manually.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    } catch {
      if (finish()) setLocationError("Unable to access your location. Enter coordinates manually.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || locationPending.current) return;
    const validation: Partial<Values> = {};
    if (!isDelete) {
      if (!values.name.trim()) validation.name = "Enter a branch name.";
      for (const [field, limit] of [["latitude", 90], ["longitude", 180]] as const) {
        const number = Number(values[field]);
        if (!values[field].trim() || !Number.isFinite(number) || number < -limit || number > limit) validation[field] = `Enter a number between -${limit} and ${limit}.`;
      }
      setErrors(validation);
      const first = Object.keys(validation)[0];
      if (first) { document.getElementById(`branch-${first}`)?.focus(); return; }
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api(branch ? `/api/branches/${branch.id}` : "/api/branches", {
        method: isDelete ? "DELETE" : branch ? "PUT" : "POST",
        ...(!isDelete && { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.name.trim(), latitude: Number(values.latitude), longitude: Number(values.longitude) }) }),
      });
      onComplete(isDelete ? "Branch deleted successfully." : branch ? "Branch updated successfully." : "Branch added successfully.");
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError && error.status === 404) onMissing();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <BranchDialog title={isDelete ? "Delete branch" : branch ? "Edit branch" : "Add Branch"} busy={busy} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="space-y-5 px-6 py-6">
          {isDelete ? <p className="break-words text-sm leading-6 text-zinc-600 [overflow-wrap:anywhere]">Delete <strong className="text-zinc-900">{branch?.name}</strong>? This action cannot be undone.</p> : (
            <fieldset disabled={busy} className="space-y-5">
              <div>
                <button type="button" className={secondary} onClick={useCurrentLocation} disabled={locating} aria-busy={locating}>
                  {locating ? <LoaderCircle size={16} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <MapPin size={16} className="shrink-0" aria-hidden="true" />}
                  {locating ? "Getting location..." : "Use Current Location"}
                </button>
                <p role="status" className="mt-2 text-sm text-teal-800">{locating ? "Getting location..." : locationStatus}</p>
                {locationError && <p role="alert" className="mt-2 text-sm text-red-700">{locationError}</p>}
              </div>
              {([['name', 'Branch Name'], ['latitude', 'Latitude'], ['longitude', 'Longitude']] as const).map(([field, label]) => (
                <div key={field}>
                  <label htmlFor={`branch-${field}`} className="mb-2 block text-sm font-medium">{label}</label>
                  <input id={`branch-${field}`} name={field} type={field === "name" ? "text" : "number"} step={field === "name" ? undefined : "any"}
                    min={field === "latitude" ? -90 : field === "longitude" ? -180 : undefined} max={field === "latitude" ? 90 : field === "longitude" ? 180 : undefined}
                    required value={values[field]} onChange={(event) => { setValues({ ...values, [field]: event.target.value }); setErrors({ ...errors, [field]: undefined }); }}
                    aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `branch-${field}-error` : undefined}
                    className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 aria-invalid:border-red-500 disabled:bg-zinc-100" />
                  {errors[field] && <p id={`branch-${field}-error`} className="mt-2 text-sm text-red-700">{errors[field]}</p>}
                </div>
              ))}
            </fieldset>
          )}
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy || locating} className={isDelete ? `${button} bg-red-700 text-white hover:bg-red-800` : primary}>
            {busy ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : isDelete ? <Trash2 size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
            {busy ? isDelete ? "Deleting..." : "Saving..." : isDelete ? "Delete branch" : branch ? "Save changes" : "Create branch"}
          </button>
        </div>
      </form>
    </BranchDialog>
  );
}

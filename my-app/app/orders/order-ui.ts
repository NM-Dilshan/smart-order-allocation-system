export type Product = { id: number; name: string; price: number };
export type AllocatedOrder = Order & { allocation: { branchId: number; branchName: string; distanceKm: number; workload: number; score: number } };
export type Order = {
  id: number; status: "PENDING" | "ALLOCATED" | "CANCELLED" | "COMPLETED";
  customerLatitude: number; customerLongitude: number; createdAt: string;
  branchId: number | null; branch: { id: number; name: string } | null;
  items: { id: number; productId: number; quantity: number; product: Product }[];
};

export const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50";
export const primary = `${button} bg-teal-700 text-white hover:bg-teal-800`;
export const secondary = `${button} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`;
export const input = "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:outline-teal-700 disabled:bg-zinc-100";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { cache: "no-store", ...options }); }
  catch { throw new Error("Unable to connect to the server. Please try again."); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The request could not be completed. Please retry.");
  if (body === null) throw new Error("Invalid server response. Please retry.");
  return body as T;
}
export const message = (error: unknown) => error instanceof Error ? error.message : "Unable to complete the request.";

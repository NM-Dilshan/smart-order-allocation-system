import type { Prisma } from "@/app/generated/prisma/client";

export const EARTH_RADIUS_KM = 6371;
// Proximity has higher priority; workload still distributes orders more evenly.
export const DISTANCE_WEIGHT = 0.7;
export const WORKLOAD_WEIGHT = 0.3;
export const ACTIVE_ORDER_STATUSES = ["ALLOCATED"] as const;

type Item = { productId: number; quantity: number };
type Branch = { id: number; name: string; latitude: number; longitude: number };
export type BranchMetrics = { branchId: number; branchName: string; distanceKm: number; workload: number };
export type Allocation = BranchMetrics & { normalizedDistance: number; normalizedWorkload: number; score: number };

export function calculateHaversineDistance(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  // Clamp floating-point drift at identical/antipodal points.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export async function findEligibleBranches(tx: Prisma.TransactionClient, items: Item[]): Promise<Branch[]> {
  if (!items.length) return [];
  // A single branch must have enough stock for every requested item.
  return tx.branch.findMany({
    where: { AND: items.map(({ productId, quantity }) => ({ inventories: { some: { productId, quantity: { gte: quantity } } } })) },
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { id: "asc" },
  });
}

export async function calculateBranchWorkload(tx: Prisma.TransactionClient, branchIds: number[]): Promise<Map<number, number>> {
  const counts = await tx.order.groupBy({
    by: ["branchId"], where: { branchId: { in: branchIds }, status: { in: [...ACTIVE_ORDER_STATUSES] } }, _count: { _all: true },
  });
  return new Map(counts.flatMap((row) => row.branchId === null ? [] : [[row.branchId, row._count._all] as const]));
}

export function normalizeMetrics(branches: BranchMetrics[]) {
  // Scale distance and workload against the eligible branches before scoring.
  const maxDistance = branches.reduce((max, branch) => Math.max(max, branch.distanceKm), 0);
  const maxWorkload = branches.reduce((max, branch) => Math.max(max, branch.workload), 0);
  return branches.map((branch) => ({ ...branch,
    normalizedDistance: maxDistance === 0 ? 0 : branch.distanceKm / maxDistance,
    normalizedWorkload: maxWorkload === 0 ? 0 : branch.workload / maxWorkload,
  }));
}

export function calculateAllocationScore(normalizedDistance: number, normalizedWorkload: number): number {
  return normalizedDistance * DISTANCE_WEIGHT + normalizedWorkload * WORKLOAD_WEIGHT;
}

export function selectBestBranch(branches: Allocation[]): Allocation | null {
  // Prefer the lowest score, with consistent tie-breaks for equal candidates.
  return [...branches].sort((a, b) => a.score - b.score || a.distanceKm - b.distanceKm || a.workload - b.workload || a.branchId - b.branchId)[0] ?? null;
}

export async function allocateOrder(tx: Prisma.TransactionClient, items: Item[], latitude: number, longitude: number): Promise<Allocation | null> {
  const branches = await findEligibleBranches(tx, items);
  if (!branches.length) return null;
  const workloads = await calculateBranchWorkload(tx, branches.map((branch) => branch.id));
  const metrics = branches.map((branch) => ({ branchId: branch.id, branchName: branch.name,
    distanceKm: calculateHaversineDistance(latitude, longitude, branch.latitude, branch.longitude),
    workload: workloads.get(branch.id) ?? 0,
  }));
  return selectBestBranch(normalizeMetrics(metrics).map((branch) => ({ ...branch, score: calculateAllocationScore(branch.normalizedDistance, branch.normalizedWorkload) })));
}

import { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";

export function parseBranchId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 2147483647 ? id : null;
}

export function validateBranch(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." } as const;
  }

  const { name, latitude, longitude } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Name is required and must not be empty." } as const;
  }
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: "Latitude must be a finite number between -90 and 90." } as const;
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "Longitude must be a finite number between -180 and 180." } as const;
  }

  return { data: { name: name.trim(), latitude, longitude } } as const;
}

export const deletionConflict = "Cannot delete a branch with related inventory or orders.";

export function branchError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ error: deletionConflict }, { status: 409 });
    }
    if (error.code === "P2034") {
      return NextResponse.json({ error: "Branch changed concurrently. Please retry." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Unable to complete the branch request." }, { status: 500 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { branchError, deletionConflict, parseBranchId, validateBranch } from "@/lib/branches";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const id = parseBranchId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid branch ID." }, { status: 400 });
  }
  try {
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }
    return NextResponse.json(branch);
  } catch (error) {
    return branchError(error);
  }
}

export async function PUT(req: Request, context: Context) {
  const id = parseBranchId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid branch ID." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateBranch(body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  try {
    const branch = await prisma.branch.update({ where: { id }, data: result.data });
    return NextResponse.json(branch);
  } catch (error) {
    return branchError(error);
  }
}

export async function DELETE(_req: Request, context: Context) {
  const id = parseBranchId((await context.params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid branch ID." }, { status: 400 });
  }
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Block concurrent foreign-key references until the check and deletion finish.
      const rows = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Branch" WHERE "id" = ${id} FOR UPDATE
      `;
      if (rows.length === 0) return "missing";

      const branch = await tx.branch.findUniqueOrThrow({
        where: { id },
        select: { _count: { select: { inventories: true, orders: true } } },
      });
      if (branch._count.inventories > 0 || branch._count.orders > 0) return "conflict";

      await tx.branch.delete({ where: { id } });
      return "deleted";
    }, { isolationLevel: "ReadCommitted" });

    if (outcome === "missing") {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }
    if (outcome === "conflict") {
      return NextResponse.json({ error: deletionConflict }, { status: 409 });
    }
    return NextResponse.json({ message: "Branch deleted successfully." });
  } catch (error) {
    return branchError(error);
  }
}

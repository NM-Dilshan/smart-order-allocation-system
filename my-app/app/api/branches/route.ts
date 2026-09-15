import { prisma } from "@/lib/db";
import { branchError, validateBranch } from "@/lib/branches";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json(branches);
  } catch (error) {
    return branchError(error);
  }
}

export async function POST(req: Request) {
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
    const branch = await prisma.branch.create({ data: result.data });
    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    return branchError(error);
  }
}

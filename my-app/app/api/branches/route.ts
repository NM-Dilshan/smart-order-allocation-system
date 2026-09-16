import { withManagement } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { branchError, validateBranch } from "@/lib/branches";
import { NextResponse } from "next/server";

async function GETHandler() {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json(branches);
  } catch (error) {
    return branchError(error);
  }
}

async function POSTHandler(req: Request) {
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

export const GET = withManagement(GETHandler);
export const POST = withManagement(POSTHandler);

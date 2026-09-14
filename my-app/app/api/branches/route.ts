import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const branches = await prisma.branch.findMany();

  return NextResponse.json(branches);
}

export async function POST(req: Request) {
  const body = await req.json();

  const branch = await prisma.branch.create({
    data: {
      name: body.name,
      latitude: body.latitude,
      longitude: body.longitude,
    },
  });

  return NextResponse.json(branch);
}
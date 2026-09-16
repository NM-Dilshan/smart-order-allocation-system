import { withManagement } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productError, validateProduct } from "@/lib/products";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const products = await prisma.product.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json(products);
  } catch (error) {
    return productError(error);
  }
}

async function POSTHandler(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const result = validateProduct(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    const product = await prisma.product.create({ data: result.data });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return productError(error);
  }
}

export const POST = withManagement(POSTHandler);

import { NextResponse } from "next/server";
import { withCustomer, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { customerInquirySelect, INQUIRY_LIST_LIMIT } from "@/lib/inquiries";

async function GETHandler(user: CurrentUser) {
  const inquiries = await prisma.customerInquiry.findMany({ where: { userId: user.id }, select: customerInquirySelect, orderBy: { id: "desc" }, take: INQUIRY_LIST_LIMIT });
  return NextResponse.json(inquiries, { headers: { "Cache-Control": "no-store" } });
}
export const GET = withCustomer(GETHandler);

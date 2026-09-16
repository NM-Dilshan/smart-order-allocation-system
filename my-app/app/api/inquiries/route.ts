import { NextResponse } from "next/server";
import { withCustomer, withManagement, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { classifyInquiry } from "@/lib/ai-classifier";
import { customerInquirySelect, managementInquirySelect, INQUIRY_LIST_LIMIT, MAX_INQUIRY_LENGTH, validateInquiryMessage } from "@/lib/inquiries";

export const runtime = "nodejs";
export const maxDuration = 60;

async function POSTHandler(user: CurrentUser, req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const message = validateInquiryMessage(body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).message : null);
  if (!message) return NextResponse.json({ error: `Enter a message between 1 and ${MAX_INQUIRY_LENGTH} characters.` }, { status: 400 });
  let prediction;
  try { prediction = await classifyInquiry(message); }
  catch { return NextResponse.json({ error: "Classification is temporarily unavailable. Please try again." }, { status: 503 }); }
  try {
    const inquiry = await prisma.customerInquiry.create({
      data: { userId: user.id, message, predictedCategory: prediction.category, confidence: prediction.confidence, status: "OPEN" },
      select: customerInquirySelect,
    });
    return NextResponse.json(inquiry, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to save your inquiry. Please try again." }, { status: 500 }); }
}

async function GETHandler() {
  const inquiries = await prisma.customerInquiry.findMany({
    select: managementInquirySelect,
    orderBy: { id: "desc" }, take: INQUIRY_LIST_LIMIT,
  });
  return NextResponse.json(inquiries, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withCustomer(POSTHandler);
export const GET = withManagement(GETHandler);

import { NextResponse } from "next/server";
import { getCurrentUser, withManagement } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_REPLY_LENGTH, validateInquiryReply } from "@/lib/inquiries";
import { InquiryReplyError, replyToInquiry } from "@/lib/inquiry-reply";

async function POSTHandler(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id) || id > 2147483647) {
    return NextResponse.json({ error: "Invalid inquiry ID." }, { status: 400 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "reply")) {
    return NextResponse.json({ error: "Provide only the reply field." }, { status: 400 });
  }
  const reply = validateInquiryReply((body as Record<string, unknown>).reply);
  if (!reply) return NextResponse.json({ error: `Enter a reply between 1 and ${MAX_REPLY_LENGTH} characters.` }, { status: 400 });
  // The wrapper authorizes the request; the identity is read only from the server session.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.management) return NextResponse.json({ error: "Management access required." }, { status: 403 });
  try {
    const inquiry = await prisma.$transaction((tx) => replyToInquiry(tx, id, reply, user.id), { isolationLevel: "ReadCommitted" });
    return NextResponse.json(inquiry, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InquiryReplyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to send the reply. Please refresh and try again." }, { status: 500 });
  }
}

export const POST = withManagement(POSTHandler);

import type { Prisma } from "@/app/generated/prisma/client";
import { managementInquirySelect } from "@/lib/inquiries";

export class InquiryReplyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function replyToInquiry(tx: Prisma.TransactionClient, id: number, reply: string, repliedById: number) {
  // PostgreSQL rechecks this predicate after a concurrent updater commits.
  // Only the winner can write the reply and all resolution metadata together.
  const result = await tx.customerInquiry.updateMany({
    where: { id, status: "OPEN" },
    data: { adminReply: reply, repliedAt: new Date(), repliedById, status: "RESOLVED" },
  });
  if (result.count !== 1) {
    const existing = await tx.customerInquiry.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new InquiryReplyError("Inquiry not found.", 404);
    throw new InquiryReplyError("This inquiry has already been resolved. Refresh to see the reply.", 409);
  }
  return tx.customerInquiry.findUniqueOrThrow({ where: { id }, select: managementInquirySelect });
}

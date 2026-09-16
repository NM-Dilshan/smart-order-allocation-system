export const MAX_INQUIRY_LENGTH = 2000;
export const INQUIRY_LIST_LIMIT = 100;
export const MAX_REPLY_LENGTH = 2000;

export function validateInquiryReply(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reply = value.trim();
  return reply.length > 0 && reply.length <= MAX_REPLY_LENGTH ? reply : null;
}

export function validateInquiryMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message.length > 0 && message.length <= MAX_INQUIRY_LENGTH ? message : null;
}

export const customerInquirySelect = {
  id: true, message: true, predictedCategory: true, createdAt: true,
  status: true, adminReply: true, repliedAt: true,
} as const;

export const managementInquirySelect = {
  ...customerInquirySelect,
  confidence: true,
  user: { select: { name: true, email: true } },
  repliedBy: { select: { name: true, email: true } },
} as const;

export type Inquiry = { id: number; message: string; predictedCategory: string; createdAt: string; status: "OPEN" | "RESOLVED"; adminReply: string | null; repliedAt: string | null };
export type ManagementInquiry = Inquiry & { confidence: number; user: { name: string; email: string }; repliedBy: { name: string; email: string } | null };

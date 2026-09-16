import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { hashPassword } from "@/lib/passwords.mjs";

const EMAIL = "assessment-customer@smart-order.invalid";
let disabledPassword: Promise<string> | undefined;

export async function getAssessmentCustomer(tx: Prisma.TransactionClient) {
  disabledPassword ??= hashPassword(randomBytes(48).toString("hex"));
  const password = await disabledPassword;
  const customer = await tx.user.upsert({
    where: { email: EMAIL }, update: {},
    create: { name: "Assessment Customer", email: EMAIL, password, role: "CUSTOMER" }, select: { id: true },
  });
  // Upgrade the historical non-login marker without altering genuine user credentials.
  await tx.user.updateMany({ where: { id: customer.id, password: "!login-disabled-assessment-customer" }, data: { password } });
  return customer;
}

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Session = { userId?: number; credentialVersion?: string };
const COOKIE_NAME = "smart-order-session";

export function isManagementUser(user: { email: string; role: string }) {
  return !user.email.toLowerCase().endsWith("@smart-order.invalid") && ["ADMIN", "STAFF"].includes(user.role);
}

export function isCustomerUser(user: { email: string; role: string }) {
  return user.role === "CUSTOMER" && !user.email.toLowerCase().endsWith("@smart-order.invalid");
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function credentialVersion(passwordHash: string) {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(passwordHash).digest("hex");
}

export async function getSession() {
  const password = process.env.AUTH_SECRET;
  if (!password || password.length < 32) throw new Error("Authentication is not configured.");
  return getIronSession<Session>(await cookies(), {
    password, cookieName: COOKIE_NAME, ttl: 60 * 60 * 8,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" },
  });
}

export async function getCurrentUser() {
  if (!(await cookies()).has(COOKIE_NAME)) return null;
  const session = await getSession();
  if (!Number.isInteger(session.userId)) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, name: true, email: true, password: true, role: true } });
  // Reject stale sessions when the account's password has changed.
  if (!user || !user.password.startsWith("scrypt$") || credentialVersion(user.password) !== session.credentialVersion) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, management: isManagementUser(user) };
}

export function validOrigin(request: Request) {
  // Require the configured origin to protect requests that change data.
  const origin = process.env.AUTH_ORIGIN;
  return !!origin && request.headers.get("origin") === origin;
}

export function withManagement<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      if (!user.management) return NextResponse.json({ error: "Management access required." }, { status: 403 });
      const request = args[0];
      if (request instanceof Request && !["GET", "HEAD"].includes(request.method) && !validOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      return await handler(...args);
    } catch { return NextResponse.json({ error: "Unable to complete the request." }, { status: 500 }); }
  };
}

export function withCustomer<T extends unknown[]>(handler: (user: CurrentUser, ...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      if (!isCustomerUser(user)) return NextResponse.json({ error: "Customer access required." }, { status: 403 });
      const request = args[0];
      if (request instanceof Request && !["GET", "HEAD"].includes(request.method) && !validOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      return await handler(user, ...args);
    } catch { return NextResponse.json({ error: "Unable to complete the request." }, { status: 500 }); }
  };
}

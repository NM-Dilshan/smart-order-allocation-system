import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { credentialVersion, getSession, isCustomerUser, isManagementUser, validOrigin } from "@/lib/auth";
import { verifyPassword } from "@/lib/passwords.mjs";
import { allowLogin } from "@/lib/login-limit";

export async function login(req: Request, audience: "customer" | "management") {
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid login request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== "string" || !password.length || password.length > 256) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  const normalizedEmail = email.trim().toLowerCase();
  if (!allowLogin(normalizedEmail)) return NextResponse.json({ error: "Too many login attempts. Try again in 15 minutes." }, { status: 429 });
  try {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const verified = await verifyPassword(password, user?.password ?? "");
    if (!user || !verified || !(audience === "management" ? isManagementUser(user) : isCustomerUser(user))) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    const session = await getSession();
    session.userId = user.id; session.credentialVersion = credentialVersion(user.password);
    await session.save();
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to sign in." }, { status: 500 }); }
}

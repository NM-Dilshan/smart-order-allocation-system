import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { validOrigin } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords.mjs";
import { allowLogin } from "@/lib/login-limit";

export async function POST(req: Request) {
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid registration request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid registration request." }, { status: 400 });
  const { name, email, password, confirmPassword } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return NextResponse.json({ error: "Enter a name between 1 and 100 characters." }, { status: 400 });
  if (!/^(?:\p{L}\p{M}*| )+$/u.test(name.trim())) return NextResponse.json({ error: "Name can only contain letters and spaces." }, { status: 400 });
  if (typeof email !== "string" || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().toLowerCase().endsWith("@smart-order.invalid")) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (typeof password !== "string" || password.length < 12 || password.length > 256) return NextResponse.json({ error: "Use a password between 12 and 256 characters." }, { status: 400 });
  if (typeof confirmPassword !== "string" || password !== confirmPassword) return NextResponse.json({ error: "Passwords must match." }, { status: 400 });
  const normalizedEmail = email.trim().toLowerCase();
  if (!allowLogin(`register:${normalizedEmail}`)) return NextResponse.json({ error: "Too many registration attempts. Try again in 15 minutes." }, { status: 429 });
  try {
    // Whitelist public fields. Never accept role, id, or a password hash from the client.
    await prisma.user.create({ data: { name: name.trim(), email: normalizedEmail, password: await hashPassword(password), role: "CUSTOMER" }, select: { id: true } });
    return NextResponse.json({ message: "Account created. Sign in to place your order." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    return NextResponse.json({ error: "Unable to create your account. Please try again." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try { return NextResponse.json({ user: await getCurrentUser() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Unable to check session." }, { status: 500 }); }
}

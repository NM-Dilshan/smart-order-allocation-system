import { NextResponse } from "next/server";
import { getSession, validOrigin } from "@/lib/auth";

export async function POST(req: Request) {
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    (await getSession()).destroy();
    return NextResponse.json({ message: "Signed out." });
  } catch { return NextResponse.json({ error: "Unable to sign out." }, { status: 500 }); }
}

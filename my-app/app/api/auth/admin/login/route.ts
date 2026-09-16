import { login } from "@/lib/login";

export async function POST(req: Request) { return login(req, "management"); }

import { env } from "@/lib/env";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";

// Local dev only — Vercel Authentication handles production.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z.object({ password: z.string() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const valid = parsed.data.password === process.env.APP_PASSWORD;
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Sign a simple session value with APP_SECRET
  const token = crypto
    .createHmac("sha256", env.APP_SECRET)
    .update(`session:${Date.now()}`)
    .digest("hex");

  const cookieStore = await cookies();
  cookieStore.set("__session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}

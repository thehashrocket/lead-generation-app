import { timingSafeEqual } from "crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = z.object({ password: z.string() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const expected = Buffer.from(process.env.APP_PASSWORD ?? "");
  const actual = Buffer.from(parsed.data.password);
  const passwordMatch =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!passwordMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  session.authenticated = true;
  await session.save();

  return NextResponse.json({ ok: true });
}

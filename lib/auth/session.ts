import { getIronSession } from "iron-session";
import type { SessionOptions } from "iron-session";
import { type NextRequest, NextResponse } from "next/server";

export type SessionData = {
  authenticated?: boolean;
};

// Uses process.env directly — safe for Edge runtime (no T3 Env imports here)
export const sessionOptions: SessionOptions = {
  get password() {
    if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 16) {
      throw new Error("APP_SECRET is missing or too short — must be at least 16 characters");
    }
    return process.env.APP_SECRET;
  },
  cookieName: "__session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  },
};

/** Returns 401 JSON response if the request has no authenticated session, null otherwise. */
export async function requireWebSession(req: NextRequest): Promise<NextResponse | null> {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

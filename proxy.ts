import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // All /api/* routes are public — authenticated via their own mechanisms
  // (bearer token for /api/contacts, Svix signature for /api/webhooks/*, etc.)
  if (pathname === "/login" || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.authenticated) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

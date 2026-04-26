import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Vercel Authentication handles prod. This proxy gate protects local dev.
// In production, set VERCEL_AUTHENTICATION=1 in the Vercel dashboard instead.
export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Public: webhooks and health must be reachable without auth
  if (
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/contacts") ||
    pathname.startsWith("/api/health")
  ) {
    return NextResponse.next();
  }

  // In production Vercel Authentication handles everything — skip cookie check
  if (process.env.NODE_ENV === "production") {
    return NextResponse.next();
  }

  const session = req.cookies.get("__session")?.value;
  if (!session) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

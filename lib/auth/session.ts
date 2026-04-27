import type { SessionOptions } from "iron-session";

export type SessionData = {
  authenticated?: boolean;
};

// Uses process.env directly — safe for Edge runtime (no T3 Env imports here)
export const sessionOptions: SessionOptions = {
  password: process.env.APP_SECRET!,
  cookieName: "__session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  },
};

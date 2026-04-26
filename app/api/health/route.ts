import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const TIMEOUT_MS = 2000;
let cachedAt = 0;
let cachedResult: Record<string, string> = {};

async function checkWithTimeout(name: string, fn: () => Promise<void>): Promise<[string, string]> {
  try {
    await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), TIMEOUT_MS))]);
    return [name, "ok"];
  } catch {
    return [name, "error"];
  }
}

export async function GET(): Promise<NextResponse> {
  const now = Date.now();
  if (now - cachedAt < 60_000) {
    return NextResponse.json(cachedResult);
  }

  const checks = await Promise.all([
    checkWithTimeout("db", async () => { await db.execute(sql`SELECT 1`); }),
    checkWithTimeout("propublica", async () => {
      const res = await fetch("https://projects.propublica.org/nonprofits/api/v2/search.json?q=test");
      if (!res.ok) throw new Error("non-ok");
    }),
    checkWithTimeout("resend", async () => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "HEAD",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      if (res.status >= 500) throw new Error("server error");
    }),
  ]);

  cachedResult = Object.fromEntries(checks);
  cachedAt = now;
  return NextResponse.json(cachedResult);
}

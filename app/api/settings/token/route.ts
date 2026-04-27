import { createApiToken, revokeAllTokens } from "@/lib/auth/tokens";
import { requireWebSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  await revokeAllTokens();
  const { token, id } = await createApiToken("chrome-extension");

  const [meta] = await db
    .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, expiresAt: apiTokens.expiresAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(eq(apiTokens.id, id))
    .limit(1);

  return NextResponse.json({ token, tokenMeta: meta });
}

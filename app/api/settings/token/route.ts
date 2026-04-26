import { createApiToken, revokeAllTokens } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  await revokeAllTokens();
  const { token, id } = await createApiToken("chrome-extension");

  const [meta] = await db
    .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(eq(apiTokens.id, id))
    .limit(1);

  return NextResponse.json({ token, tokenMeta: meta });
}

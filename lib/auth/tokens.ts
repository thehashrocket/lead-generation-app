import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export function generateToken(): string {
  return `lgat_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(name: string): Promise<{ token: string; id: string }> {
  const token = generateToken();
  const tokenHash = hashToken(token);

  const [row] = await db
    .insert(apiTokens)
    .values({ name, tokenHash })
    .returning({ id: apiTokens.id });

  return { token, id: row.id };
}

export async function validateApiToken(
  token: string,
  ip?: string,
  userAgent?: string,
): Promise<boolean> {
  const hash = hashToken(token);
  const [row] = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);

  if (!row) return false;

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date(), lastUsedIp: ip, lastUsedUserAgent: userAgent })
    .where(eq(apiTokens.id, row.id));

  return true;
}

export async function revokeAllTokens(): Promise<void> {
  await db.delete(apiTokens);
}

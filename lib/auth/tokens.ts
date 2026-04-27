import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { and, eq, gt } from "drizzle-orm";
import crypto from "crypto";

const TOKEN_TTL_DAYS = 90;

export function generateToken(): string {
  return `lgat_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(name: string): Promise<{ token: string; id: string }> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db
    .insert(apiTokens)
    .values({ name, tokenHash, expiresAt })
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
    .where(and(eq(apiTokens.tokenHash, hash), gt(apiTokens.expiresAt, new Date())))
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

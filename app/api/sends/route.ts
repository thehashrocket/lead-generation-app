import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { sendDraft } from "@/lib/services/sends/resend";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  draftId: z.string(),
  toEmail: z.string().email(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { draftId, toEmail } = parsed.data;

  await db.update(drafts).set({ toEmail }).where(eq(drafts.id, draftId));

  const result = await sendDraft(draftId, toEmail);

  if (!result.ok) {
    logger.warn({ event: "send_failed", draftId, code: result.code });
    const status = result.code === "cap_reached" ? 429 : result.code === "suppressed" ? 422 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  logger.info({ event: "email_sent", draftId, sendId: result.sendId });
  return NextResponse.json({ ok: true, sendId: result.sendId });
}

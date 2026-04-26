import { db } from "@/lib/db";
import { sends, suppressions, webhookEvents } from "@/lib/db/schema";
import { verifyResendSignature } from "@/lib/services/webhooks/verify";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  const rawBody = await req.text();

  const verified = verifyResendSignature(rawBody, svixId, svixTimestamp, svixSignature);
  if (!verified) {
    logger.warn({ event: "webhook_sig_mismatch", svixId }, "Resend webhook signature invalid");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = svixId;
  const eventType = String(payload.type ?? "unknown");

  // Idempotency: skip already-processed events
  const existing = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, eventId))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ status: "duplicate" });
  }

  await db.insert(webhookEvents).values({
    eventId,
    eventType,
    payload,
    signatureVerified: true,
  });

  const data = payload.data as { email_id?: string; to?: string | string[] } | undefined;
  const resendMessageId = String(data?.email_id ?? "");

  function extractToEmail(d: typeof data): string {
    if (!d?.to) return "";
    return Array.isArray(d.to) ? (d.to[0] ?? "") : d.to;
  }

  if (eventType === "email.delivered") {
    await db
      .update(sends)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(eq(sends.resendMessageId, resendMessageId));
    logger.info({ event: "email_delivered", resendMessageId }, "Email delivered");
  }

  if (eventType === "email.bounced") {
    await db
      .update(sends)
      .set({ status: "bounced", bouncedAt: new Date() })
      .where(eq(sends.resendMessageId, resendMessageId));

    const toEmail = extractToEmail(data);
    if (toEmail) {
      await db
        .insert(suppressions)
        .values({ email: toEmail, reason: "bounced", source: "webhook" })
        .onConflictDoNothing();
      logger.info({ event: "suppression_added", email: "[redacted]", reason: "bounced" });
    }
  }

  if (eventType === "email.complained") {
    await db
      .update(sends)
      .set({ status: "complained", complainedAt: new Date() })
      .where(eq(sends.resendMessageId, resendMessageId));

    const toEmail = extractToEmail(data);
    if (toEmail) {
      await db
        .insert(suppressions)
        .values({ email: toEmail, reason: "complained", source: "webhook" })
        .onConflictDoNothing();
      logger.info({ event: "suppression_added", email: "[redacted]", reason: "complained" });
    }
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.eventId, eventId));

  return NextResponse.json({ status: "ok" });
}

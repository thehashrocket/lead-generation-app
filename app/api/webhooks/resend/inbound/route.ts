import { db } from "@/lib/db";
import { replies, sends, webhookEvents } from "@/lib/db/schema";
import { classifyReply } from "@/lib/services/replies/classifier";
import { forwardReplyToJason } from "@/lib/services/sends/resend";
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
    logger.warn({ event: "inbound_sig_mismatch" }, "Inbound webhook signature invalid");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Loop prevention: check after signature verify so the header can't be forged by unauthenticated callers
  const autoForwarded = req.headers.get("x-auto-forwarded");
  if (autoForwarded === "volunteerready") {
    return NextResponse.json({ status: "loop_blocked" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = svixId;

  // Idempotency: use onConflictDoNothing to handle concurrent duplicate deliveries safely
  const inserted = await db
    .insert(webhookEvents)
    .values({ eventId, eventType: "inbound", payload, signatureVerified: true })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ status: "duplicate" });
  }

  // Extract VERP token from the To: address (replies+<token>@replies.volunteerready.org)
  const toAddress = String(payload.to ?? "");
  const verpMatch = toAddress.match(/replies\+([^@]+)@/);
  const verpToken = verpMatch?.[1];

  if (!verpToken) {
    logger.warn({ event: "inbound_no_verp" }, "Inbound reply missing VERP token");
    return NextResponse.json({ status: "no_verp" });
  }

  const [send] = await db
    .select({ id: sends.id })
    .from(sends)
    .where(eq(sends.verpToken, verpToken))
    .limit(1);

  if (!send) {
    logger.warn({ event: "inbound_verp_mismatch" }, "VERP token not matched to send");
    return NextResponse.json({ status: "verp_mismatch" });
  }

  const fromEmail = String(payload.from ?? "");
  const fromName = String(payload.from_name ?? "");
  const subject = String(payload.subject ?? "");
  const bodyText = String(payload.plain_text ?? payload.text ?? "");
  const bodyHtml = String(payload.html ?? "");
  const snippet = bodyText.slice(0, 200);
  const inboundMessageId = String(payload.message_id ?? "");
  const inReplyTo = String(payload.in_reply_to ?? "");

  const headers: Record<string, string> = {};
  if (payload.headers && typeof payload.headers === "object") {
    for (const [k, v] of Object.entries(payload.headers as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
  }

  const classification = classifyReply(headers, bodyText);

  await db.insert(replies).values({
    sendId: send.id,
    resendInboundId: eventId,
    classification,
    fromEmail,
    fromName: fromName || null,
    bodyText,
    bodyHtml,
    snippet,
    messageId: inboundMessageId || null,
    inReplyTo: inReplyTo || null,
  });

  logger.info({ event: "reply_received", sendId: send.id, classification });

  // Auto-forward human replies to Jason's Gmail
  if (classification === "human") {
    await forwardReplyToJason(send.id, fromEmail, fromName || null, subject, bodyText, inReplyTo || undefined);
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.eventId, eventId));

  return NextResponse.json({ status: "ok" });
}

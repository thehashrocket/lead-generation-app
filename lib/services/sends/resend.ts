import { db } from "@/lib/db";
import { contacts, drafts, forwardLog, orgs, sends, suppressions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { Resend } from "resend";
import { and, count, eq, gt, or } from "drizzle-orm";
import { sql } from "drizzle-orm";

const resend = new Resend(env.RESEND_API_KEY);

const WEEKLY_SEND_CAP = 50;
const FORWARD_COUNT_CAP = 5;
const CIRCUIT_BREAKER_WINDOW_SECONDS = 60;
const CIRCUIT_BREAKER_MAX = 20;

export type SendResult =
  | { ok: true; sendId: string; resendMessageId: string }
  | { ok: false; error: string; code?: "cap_reached" | "suppressed" | "provider_error" };

export async function sendDraft(draftId: string, toEmail: string): Promise<SendResult> {
  const [draft] = await db
    .select({ subject: drafts.subject, body: drafts.body, orgId: drafts.orgId })
    .from(drafts)
    .where(eq(drafts.id, draftId))
    .limit(1);
  if (!draft) return { ok: false, error: "Draft not found" };

  const weekCount = await getWeeklySendCount();
  if (weekCount >= WEEKLY_SEND_CAP) {
    return { ok: false, error: "Weekly cap reached — resets Monday", code: "cap_reached" };
  }

  const suppressed = await isSuppressed(toEmail);
  if (suppressed) {
    return { ok: false, error: "Email address is suppressed", code: "suppressed" };
  }

  const verpToken = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();
  const replyTo = `replies+${verpToken}@${env.RESEND_REPLY_TO_DOMAIN}`;

  const [send] = await db
    .insert(sends)
    .values({ draftId, verpToken, idempotencyKey, status: "queued" })
    .returning();

  try {
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: toEmail,
      replyTo,
      subject: draft.subject,
      text: draft.body,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    });

    if (result.error) {
      await db.delete(sends).where(eq(sends.id, send.id));
      return { ok: false, error: result.error.message, code: "provider_error" };
    }

    const resendMessageId = result.data?.id ?? "";
    await db
      .update(sends)
      .set({ resendMessageId, status: "queued" })
      .where(eq(sends.id, send.id));

    return { ok: true, sendId: send.id, resendMessageId };
  } catch (err) {
    await db.delete(sends).where(eq(sends.id, send.id));
    return { ok: false, error: String(err), code: "provider_error" };
  }
}

export async function getWeeklySendCount(): Promise<number> {
  const monday = getMondayOfCurrentWeek();
  const [row] = await db
    .select({ count: count() })
    .from(sends)
    .where(gt(sends.sentAt, monday));
  return row?.count ?? 0;
}

async function isSuppressed(email: string): Promise<boolean> {
  const domain = email.split("@")[1] ?? "";
  const [row] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(or(eq(suppressions.email, email), eq(suppressions.domain, domain)))
    .limit(1);
  return !!row;
}

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export async function shouldForward(sendId: string, fromEmail: string): Promise<{
  allowed: boolean;
  blockReason?: "header" | "count_cap" | "own_domain" | "circuit_breaker";
}> {
  const ownDomains = ["volunteerready.org", "jasshultz@gmail.com"];
  if (ownDomains.some((d) => fromEmail.includes(d))) {
    return { allowed: false, blockReason: "own_domain" };
  }

  const [countRow] = await db
    .select({ count: count() })
    .from(forwardLog)
    .where(and(eq(forwardLog.sendId, sendId), eq(forwardLog.blocked, false)));
  if ((countRow?.count ?? 0) >= FORWARD_COUNT_CAP) {
    return { allowed: false, blockReason: "count_cap" };
  }

  const windowStart = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_SECONDS * 1000);
  const [globalRow] = await db
    .select({ count: count() })
    .from(forwardLog)
    .where(and(eq(forwardLog.blocked, false), gt(forwardLog.forwardedAt, windowStart)));
  if ((globalRow?.count ?? 0) >= CIRCUIT_BREAKER_MAX) {
    return { allowed: false, blockReason: "circuit_breaker" };
  }

  return { allowed: true };
}

export async function forwardReplyToJason(
  sendId: string,
  fromEmail: string,
  fromName: string | null,
  subject: string,
  bodyText: string,
  originalMessageId?: string,
): Promise<void> {
  const check = await shouldForward(sendId, fromEmail);

  await db.insert(forwardLog).values({
    sendId,
    blocked: !check.allowed,
    blockReason: check.blockReason ?? null,
  });

  if (!check.allowed) return;

  const replyFrom = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: "jasshultz@gmail.com",
    replyTo: fromEmail,
    subject: `[Fwd] ${subject}`,
    text: `Forwarded reply from ${replyFrom}:\n\n${bodyText}`,
    headers: {
      "X-Auto-Forwarded": "volunteerready",
      ...(originalMessageId ? { "In-Reply-To": originalMessageId } : {}),
    },
  });
}

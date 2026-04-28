import { db } from "@/lib/db";
import { contacts, orgs, usageLog } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { lookupEmail, splitName } from "@/lib/services/contacts/email-lookup";
import { env } from "@/lib/env";
import { MONTHLY_HUNTER_CAP } from "@/lib/constants/hunter";
import { eq, gte, sql, sum } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  if (!env.HUNTER_API_KEY) {
    return NextResponse.json({ error: "Hunter.io not configured" }, { status: 501 });
  }

  const orgId = new URL(req.url).searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  // Find or create a contact for this org
  let [contact] = await db.select().from(contacts).where(eq(contacts.orgId, orgId)).limit(1);

  if (!contact) {
    const [inserted] = await db
      .insert(contacts)
      .values({ orgId, name: org.name })
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      // Partial unique index conflict — another request just inserted; fetch it
      [contact] = await db.select().from(contacts).where(eq(contacts.orgId, orgId)).limit(1);
    } else {
      contact = inserted;
    }
  }

  if (!contact) {
    return NextResponse.json({ error: "Failed to find or create contact" }, { status: 500 });
  }

  // Credit guard — return existing email without burning a Hunter credit
  if (contact.email) {
    return NextResponse.json({ email: contact.email, confidence: contact.emailConfidence ?? null });
  }

  // Monthly quota check
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const firstOfMonthStr = firstOfMonth.toISOString().slice(0, 10);

  const [quotaRow] = await db
    .select({ total: sum(usageLog.hunterCalls) })
    .from(usageLog)
    .where(gte(usageLog.day, firstOfMonthStr));
  const monthlyUsed = Number(quotaRow?.total ?? 0);

  if (monthlyUsed >= MONTHLY_HUNTER_CAP) {
    return NextResponse.json(
      { email: null, reason: "quota_reached", used: monthlyUsed, cap: MONTHLY_HUNTER_CAP },
      { status: 402 },
    );
  }

  if (!org.website) {
    return NextResponse.json({ email: null, reason: "no_domain" });
  }

  const { firstName, lastName } = splitName(contact.name);
  const result = await lookupEmail(org.website, firstName, lastName);

  if (!result) {
    return NextResponse.json({ email: null, reason: "not_found" });
  }

  // Persist email + confidence
  await db
    .update(contacts)
    .set({ email: result.email, emailConfidence: result.confidence })
    .where(eq(contacts.id, contact.id));

  // Track credit usage
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(usageLog)
    .values({ day: today, llmCalls: 0, llmCostUsd: 0, hunterCalls: 1 })
    .onConflictDoUpdate({
      target: usageLog.day,
      set: { hunterCalls: sql`${usageLog.hunterCalls} + 1` },
    });

  return NextResponse.json({ email: result.email, confidence: result.confidence });
}

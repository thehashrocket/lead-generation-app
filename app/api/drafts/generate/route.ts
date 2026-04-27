import { db } from "@/lib/db";
import { contacts, drafts, orgs } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { generateDraft } from "@/lib/services/drafts/generate";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  orgId: z.string(),
  ein: z.string(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { orgId, ein } = parsed.data;

  const [[org], existingContact] = await Promise.all([
    db.select().from(orgs).where(eq(orgs.ein, ein)).limit(1),
    db
      .select({ email: contacts.email, emailConfidence: contacts.emailConfidence })
      .from(contacts)
      .where(eq(contacts.orgId, orgId))
      .limit(1),
  ]);

  if (!org) return NextResponse.json({ ok: false, error: "Org not found" }, { status: 404 });

  let programs: string[] = [];
  if (org.programsJson) {
    try { programs = JSON.parse(org.programsJson); } catch {}
  }

  const result = await generateDraft({
    orgName: org.name,
    nteeCode: org.nteeCode,
    state: org.state,
    totalRevenue: org.totalRevenue,
    missionText: org.missionText,
    programs,
  });

  if (!result.ok) {
    logger.warn({ event: "draft_gen_failed", ein, error: result.error });
    return NextResponse.json({ ok: false, error: result.error, capReached: result.capReached }, { status: result.capReached ? 402 : 500 });
  }

  const PROMPT_VERSION = "v1";

  const [draft] = await db
    .insert(drafts)
    .values({
      orgId: org.id,
      subject: result.subject,
      body: result.body,
      model: result.model,
      promptVersion: PROMPT_VERSION,
    })
    .returning();

  logger.info({ event: "draft_generated", draftId: draft.id, model: result.model });

  return NextResponse.json({
    ok: true,
    draftId: draft.id,
    subject: result.subject,
    body: result.body,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    toEmail: existingContact[0]?.email ?? null,
    emailConfidence: existingContact[0]?.emailConfidence ?? null,
  });
}

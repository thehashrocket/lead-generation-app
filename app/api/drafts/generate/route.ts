import { db } from "@/lib/db";
import { contacts, drafts, orgs } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { generateDraft } from "@/lib/services/drafts/generate";
import { enrichOrgFromWebsite, isCooledDown } from "@/lib/services/orgs/website-enrichment";
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
  let missionText = org.missionText;

  // v0.4.0: inline mission enrichment via website scrape + LLM extraction.
  // Runs when missionText is null AND website is set AND not in cooldown.
  // NEVER overwrites a mission_source='990_xml' value (the 990 XML cache
  // is gold-standard; a homepage scrape must not replace it).
  const shouldEnrich =
    !missionText &&
    org.missionSource !== "990_xml" &&
    org.website &&
    !isCooledDown(org.missionEnrichmentStatus, org.missionEnrichmentAttemptedAt, true);

  if (shouldEnrich && org.website) {
    const enrichment = await enrichOrgFromWebsite(org.name, org.website);
    logger.info({
      event: "mission_enrichment_attempted",
      ein,
      status: enrichment.status,
      hasMission: !!enrichment.missionText,
      programCount: enrichment.programs.length,
    });

    // Persist status + attempt timestamp regardless of outcome.
    // Mission text + programs only persist on success — never overwrite 990 data.
    const persist: Partial<typeof orgs.$inferInsert> = {
      missionEnrichmentStatus: enrichment.status,
      missionEnrichmentAttemptedAt: new Date(),
    };
    if (enrichment.status === "success" && enrichment.missionText) {
      persist.missionText = enrichment.missionText;
      persist.missionSource = "website_scrape";
      if (enrichment.programs.length > 0) {
        persist.programsJson = JSON.stringify(enrichment.programs);
      }
    }
    await db.update(orgs).set(persist).where(eq(orgs.ein, ein));

    if (enrichment.status === "success") {
      missionText = enrichment.missionText;
      programs = enrichment.programs;
    }
  }

  const result = await generateDraft({
    orgName: org.name,
    nteeCode: org.nteeCode,
    state: org.state,
    totalRevenue: org.totalRevenue,
    missionText,
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
    // v0.4.0: surface freshly-enriched (or already-cached) context so the
    // client can refresh Org990Panel state without a separate round trip.
    missionText,
    programs,
  });
}

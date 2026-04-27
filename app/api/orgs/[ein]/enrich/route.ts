import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { fetch990Xml, parse990Xml } from "@/lib/services/orgs/990-parser";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const PROPUBLICA_BASE = "https://projects.propublica.org/nonprofits/api/v2";

async function fetchOrgWebsite(ein: string): Promise<string | null> {
  try {
    const res = await fetch(`${PROPUBLICA_BASE}/organizations/${ein}.json`, {
      headers: { "User-Agent": "LeadGenApp/1.0 (personal outreach tool)" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.organization?.website ?? null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ein: string }> },
): Promise<NextResponse> {
  const unauth = await requireWebSession(_req);
  if (unauth) return unauth;

  const { ein: rawEin } = await params;

  if (!/^\d{2}-?\d{7}$/.test(rawEin)) {
    return NextResponse.json({ error: "Invalid EIN format" }, { status: 400 });
  }
  // Normalize to no-hyphen form to match how ProPublica returns EINs (stored without hyphen)
  const ein = rawEin.replace("-", "");

  const [org] = await db.select().from(orgs).where(eq(orgs.ein, ein)).limit(1);
  if (!org) return NextResponse.json({ missionText: null, programs: [], namedContact: null });

  // Fetch ProPublica org detail for website (once per org; skip if already cached)
  if (!org.website) {
    const website = await fetchOrgWebsite(ein);
    if (website) {
      await db.update(orgs).set({ website }).where(eq(orgs.ein, ein));
    }
  }

  if (org.missionText) {
    let programs: string[] = [];
    try { if (org.programsJson) programs = JSON.parse(org.programsJson); } catch {}
    return NextResponse.json({ missionText: org.missionText, programs, namedContact: null });
  }

  const xml = await fetch990Xml(ein);
  if (!xml) {
    logger.info({ event: "990_not_found", ein });
    return NextResponse.json({ missionText: null, programs: [], namedContact: null, limited: true });
  }

  const parsed = parse990Xml(xml);
  logger.info({ event: "990_parsed", ein, pathMatched: parsed.pathMatched });

  await db.update(orgs).set({
    missionText: parsed.missionText ?? undefined,
    programsJson: parsed.programs.length > 0 ? JSON.stringify(parsed.programs) : undefined,
    enrichedAt: new Date(),
  }).where(eq(orgs.ein, ein));

  return NextResponse.json({
    missionText: parsed.missionText,
    programs: parsed.programs,
    namedContact: parsed.namedContact,
    limited: !parsed.missionText,
  });
}

import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { fetch990Xml, parse990Xml } from "@/lib/services/orgs/990-parser";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ein: string }> },
): Promise<NextResponse> {
  const { ein } = await params;

  const [org] = await db.select().from(orgs).where(eq(orgs.ein, ein)).limit(1);
  if (!org) return NextResponse.json({ missionText: null, programs: [], namedContact: null });

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

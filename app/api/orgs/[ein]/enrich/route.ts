import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { fetch990XmlFromUrls, parse990Xml } from "@/lib/services/orgs/990-parser";
import { searchOrgWebsite } from "@/lib/services/orgs/website-search";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const PROPUBLICA_BASE = "https://projects.propublica.org/nonprofits/api/v2";

type OrgDetail = {
  website: string | null;
  city: string | null;
  address: string | null;
  numEmployees: number | null;
  revenue: number | null;
  totalExpenses: number | null;
  filingUrls: string[];
  filingsWithDataCount: number;
};

async function fetchOrgDetail(ein: string): Promise<OrgDetail> {
  const empty: OrgDetail = { website: null, city: null, address: null, numEmployees: null, revenue: null, totalExpenses: null, filingUrls: [], filingsWithDataCount: 0 };
  try {
    const res = await fetch(`${PROPUBLICA_BASE}/organizations/${ein}.json`, {
      headers: { "User-Agent": "LeadGenApp/1.0 (personal outreach tool)" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return empty;
    const data = await res.json();
    const org = data.organization ?? {};
    const filings: Array<{ filing_url?: string; employees?: number | null; totfuncexpns?: number | null }> =
      data.filings_with_data ?? [];
    const latestFiling = filings[0] ?? {};
    const filingUrls = filings.flatMap((f) => (f.filing_url ? [f.filing_url] : []));
    return {
      website: org.website ?? null,
      city: org.city ?? null,
      address: org.address ?? null,
      numEmployees:
        org.num_employees != null
          ? Number(org.num_employees)
          : latestFiling.employees != null
            ? Number(latestFiling.employees)
            : null,
      revenue: org.revenue_amount != null ? Number(org.revenue_amount) : null,
      totalExpenses: latestFiling.totfuncexpns != null ? Number(latestFiling.totfuncexpns) : null,
      filingUrls,
      filingsWithDataCount: filings.length,
    };
  } catch {
    return empty;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ein: string }> },
): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const { ein: rawEin } = await params;
  const quick = req.nextUrl.searchParams.has("quick");

  if (!/^\d{2}-?\d{7}$|^\d{8}$/.test(rawEin)) {
    return NextResponse.json({ error: "Invalid EIN format" }, { status: 400 });
  }
  // Normalize: strip hyphen. Do NOT zero-pad — the DB may have stored the 8-digit form
  // (leading zero stripped by JSON number parsing). Match whatever is in the DB.
  const ein = rawEin.replace("-", "");

  const [org] = await db.select().from(orgs).where(eq(orgs.ein, ein)).limit(1);
  if (!org) return NextResponse.json({ missionText: null, programs: [], namedContact: null });

  // Fetch ProPublica org detail when fields are missing OR when we'll need the filing URL to
  // fetch 990 XML (i.e. full enrich path and mission text isn't already cached).
  const needsDetail = !org.website || !org.city || (!org.totalRevenue && !org.numEmployees);
  const needsFilingUrl = !quick && !org.missionText;
  let filingUrls: string[] = [];
  let detailExpenses: number | null = null;
  let filingsWithDataCount = 0;
  if (needsDetail || needsFilingUrl) {
    const detail = await fetchOrgDetail(ein);
    filingUrls = detail.filingUrls;
    detailExpenses = detail.totalExpenses;
    filingsWithDataCount = detail.filingsWithDataCount;
    const updates: Record<string, unknown> = {};
    if (detail.website && !org.website) updates.website = detail.website;
    if (detail.city && !org.city) updates.city = detail.city;
    if (!org.website && !updates.website) {
      const city = (updates.city as string | undefined) ?? org.city ?? null;
      const found = await searchOrgWebsite(org.name, city, org.state ?? null);
      if (found) updates.website = found;
    }
    if (detail.address && !org.address) updates.address = detail.address;
    if (detail.numEmployees != null && org.numEmployees == null) updates.numEmployees = detail.numEmployees;
    if (detail.revenue != null && !org.totalRevenue) updates.totalRevenue = String(detail.revenue);
    if (detail.totalExpenses != null && !org.totalExpenses) updates.totalExpenses = String(detail.totalExpenses);
    if (Object.keys(updates).length > 0) {
      await db.update(orgs).set(updates).where(eq(orgs.ein, ein));
      Object.assign(org, updates);
    }
  }

  // ?quick: return org detail only — skip 990 XML parsing
  if (quick) {
    return NextResponse.json({
      city: org.city ?? null,
      numEmployees: org.numEmployees ?? null,
      totalRevenue: org.totalRevenue ?? null,
      website: org.website ?? null,
    });
  }

  if (org.missionText) {
    let programs: string[] = [];
    try { if (org.programsJson) programs = JSON.parse(org.programsJson); } catch {}
    return NextResponse.json({
      missionText: org.missionText,
      programs,
      namedContact: null,
      city: org.city ?? null,
      numEmployees: org.numEmployees ?? null,
      totalExpenses: org.totalExpenses != null ? Number(org.totalExpenses) : (detailExpenses ?? null),
      website: org.website ?? null,
    });
  }

  const xml = await fetch990XmlFromUrls(filingUrls, ein);
  if (!xml) {
    logger.info({ event: "990_not_found", ein, filingsWithDataCount });
    return NextResponse.json({
      missionText: null,
      programs: [],
      namedContact: null,
      city: org.city ?? null,
      numEmployees: org.numEmployees ?? null,
      totalExpenses: org.totalExpenses != null ? Number(org.totalExpenses) : (detailExpenses ?? null),
      website: org.website ?? null,
      limited: true,
      filingsWithDataCount,
      filingUrlsFound: filingUrls.length,
    });
  }

  const parsed = parse990Xml(xml);
  logger.info({ event: "990_parsed", ein, pathMatched: parsed.pathMatched });

  const resolvedExpenses = parsed.totalExpenses ?? detailExpenses;
  await db.update(orgs).set({
    missionText: parsed.missionText ?? undefined,
    programsJson: parsed.programs.length > 0 ? JSON.stringify(parsed.programs) : undefined,
    totalExpenses: resolvedExpenses != null ? String(resolvedExpenses) : undefined,
    numEmployees: parsed.employeeCount != null && org.numEmployees == null ? parsed.employeeCount : undefined,
    enrichedAt: new Date(),
  }).where(eq(orgs.ein, ein));

  return NextResponse.json({
    missionText: parsed.missionText,
    programs: parsed.programs,
    namedContact: parsed.namedContact,
    city: org.city ?? null,
    numEmployees: parsed.employeeCount ?? org.numEmployees ?? null,
    totalExpenses: resolvedExpenses ?? null,
    website: org.website ?? null,
    limited: !parsed.missionText,
  });
}

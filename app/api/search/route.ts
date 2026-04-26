import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { searchOrgs, RateLimitError } from "@/lib/services/orgs/propublica";
import { logger } from "@/lib/logger";
import { eq, ilike, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const nteeCode = url.searchParams.get("nteeCode") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "0");

  try {
    const data = await searchOrgs({ q, nteeCode, state, page });

    // Map to SearchResultOrg shape — join with DB to get cached mission text
    const eins = data.organizations.map((o) => o.ein);
    const cached = eins.length > 0
      ? await db.select({ ein: orgs.ein, id: orgs.id, missionText: orgs.missionText })
          .from(orgs)
          .where(
            eins.length === 1
              ? eq(orgs.ein, eins[0])
              : undefined,
          )
      : [];

    const cachedMap = new Map(cached.map((c) => [c.ein, c]));

    const organizations = data.organizations.map((o) => ({
      id: cachedMap.get(o.ein)?.id ?? o.ein,
      ein: o.ein,
      name: o.name,
      nteeCode: o.ntee_code,
      state: o.state,
      totalRevenue: o.income_amount != null ? String(o.income_amount) : null,
      propublicaUrl: o.propublica_url,
      missionText: cachedMap.get(o.ein)?.missionText ?? null,
    }));

    return NextResponse.json({
      organizations,
      total_results: data.total_results,
      num_pages: data.num_pages,
      cur_page: data.cur_page,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    logger.error({ event: "search_error", err: String(err) });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { searchOrgs, applyOrganizationFilters, RateLimitError } from "@/lib/services/orgs/propublica";
import { requireWebSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { and, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const nteeCode = url.searchParams.get("nteeCode") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "0");
  const minRevenue = url.searchParams.get("minRevenue") ? Number(url.searchParams.get("minRevenue")) : undefined;
  const maxRevenue = url.searchParams.get("maxRevenue") ? Number(url.searchParams.get("maxRevenue")) : undefined;

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  try {
    const data = await searchOrgs({ q, nteeCode, state, page, minRevenue, maxRevenue });

    // ProPublica's ntee[] and state[] filters are unreliable — post-filter to guarantee correctness
    const filtered = applyOrganizationFilters(data.organizations, { nteeCode, state });

    const eins = filtered.map((o) => o.ein);
    const cached = eins.length > 0
      ? await db.select({ ein: orgs.ein, id: orgs.id, missionText: orgs.missionText })
          .from(orgs)
          .where(inArray(orgs.ein, eins))
      : [];

    const cachedMap = new Map(cached.map((c) => [c.ein, c]));

    const organizations = filtered.map((o) => ({
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
      total_results: organizations.length,
      num_pages: 1,
      cur_page: data.cur_page,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    // ProPublica unreachable — serve stale cached results so the tool stays usable
    logger.warn({ event: "search_propublica_down", err: String(err) });
    const conditions = [isNotNull(orgs.cachedAt)];
    if (q) conditions.push(ilike(orgs.name, `%${q}%`));
    if (nteeCode) conditions.push(ilike(orgs.nteeCode, nteeCode + "%"));
    if (state) conditions.push(eq(orgs.state, state));
    if (minRevenue != null) conditions.push(sql`CAST(${orgs.totalRevenue} AS bigint) >= ${minRevenue}`);
    if (maxRevenue != null) conditions.push(sql`CAST(${orgs.totalRevenue} AS bigint) <= ${maxRevenue}`);

    const staleRows = await db
      .select()
      .from(orgs)
      .where(and(...conditions))
      .limit(25);

    if (staleRows.length === 0) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const organizations = staleRows.map((o) => ({
      id: o.id,
      ein: o.ein,
      name: o.name,
      nteeCode: o.nteeCode,
      state: o.state,
      totalRevenue: o.totalRevenue,
      propublicaUrl: o.propublicaUrl,
      missionText: o.missionText,
    }));

    return NextResponse.json({
      organizations,
      total_results: organizations.length,
      num_pages: 1,
      cur_page: 0,
      stale: true,
    });
  }
}

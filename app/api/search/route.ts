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

    // Also pull matching orgs from the DB cache accumulated across all previous searches.
    // This is how state filtering works: ProPublica can't filter by state, so we rely on
    // the cache built up as the user pages through results.
    const dbConditions = [isNotNull(orgs.cachedAt)];
    if (q) dbConditions.push(ilike(orgs.name, `%${q}%`));
    if (nteeCode) {
      dbConditions.push(
        nteeCode.length === 1
          ? ilike(orgs.nteeCode, nteeCode + "%")
          : eq(orgs.nteeCode, nteeCode),
      );
    }
    if (state) dbConditions.push(eq(orgs.state, state));
    if (minRevenue != null) dbConditions.push(sql`CAST(${orgs.totalRevenue} AS bigint) >= ${minRevenue}`);
    if (maxRevenue != null) dbConditions.push(sql`CAST(${orgs.totalRevenue} AS bigint) <= ${maxRevenue}`);

    const dbRows = await db.select().from(orgs).where(and(...dbConditions)).limit(200);

    // Merge: ProPublica results take precedence (fresher), DB fills in the rest
    const propublicaEins = new Set(filtered.map((o) => o.ein));
    const dbOnlyRows = dbRows.filter((r) => !propublicaEins.has(r.ein));
    const cachedMap = new Map(dbRows.map((r) => [r.ein, r]));

    const fromPropublica = filtered.map((o) => ({
      id: cachedMap.get(o.ein)?.id ?? o.ein,
      ein: o.ein,
      name: o.name,
      nteeCode: o.ntee_code,
      state: o.state,
      totalRevenue: o.income_amount != null ? String(o.income_amount) : null,
      propublicaUrl: o.propublica_url,
      missionText: cachedMap.get(o.ein)?.missionText ?? null,
    }));

    const fromDb = dbOnlyRows.map((r) => ({
      id: r.id,
      ein: r.ein,
      name: r.name,
      nteeCode: r.nteeCode,
      state: r.state,
      totalRevenue: r.totalRevenue,
      propublicaUrl: r.propublicaUrl,
      missionText: r.missionText,
    }));

    const organizations = [...fromPropublica, ...fromDb];

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

    // ProPublica unreachable — serve stale cached results so the tool stays usable
    logger.warn({ event: "search_propublica_down", err: String(err) });
    const conditions = [isNotNull(orgs.cachedAt)];
    if (q) conditions.push(ilike(orgs.name, `%${q}%`));
    if (nteeCode) {
      conditions.push(
        nteeCode.length === 1
          ? ilike(orgs.nteeCode, nteeCode + "%")
          : eq(orgs.nteeCode, nteeCode),
      );
    }
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

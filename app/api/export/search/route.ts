import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { buildCsvResponse } from "@/lib/csv";
import { and, ilike, eq, isNotNull, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const nteeCode = url.searchParams.get("nteeCode");
  const state = url.searchParams.get("state");
  const minRevenue = url.searchParams.get("minRevenue");
  const maxRevenue = url.searchParams.get("maxRevenue");

  const conditions = [isNotNull(orgs.cachedAt)];
  if (q) conditions.push(ilike(orgs.name, `%${q}%`));
  if (nteeCode) conditions.push(eq(orgs.nteeCode, nteeCode));
  if (state) conditions.push(eq(orgs.state, state));
  if (minRevenue) conditions.push(sql`CAST(${orgs.totalRevenue} AS bigint) >= ${Number(minRevenue)}`);
  if (maxRevenue) conditions.push(sql`CAST(${orgs.totalRevenue} AS bigint) <= ${Number(maxRevenue)}`);

  const rows = await db
    .select({
      ein: orgs.ein,
      name: orgs.name,
      nteeCode: orgs.nteeCode,
      state: orgs.state,
      totalRevenue: orgs.totalRevenue,
      propublicaUrl: orgs.propublicaUrl,
    })
    .from(orgs)
    .where(and(...conditions));

  const headers = ["ein", "name", "ntee_code", "state", "total_revenue", "propublica_url"];
  const data = rows.map((r) => [r.ein, r.name, r.nteeCode, r.state, r.totalRevenue, r.propublicaUrl]);

  return buildCsvResponse(headers, data, "search-results.csv");
}

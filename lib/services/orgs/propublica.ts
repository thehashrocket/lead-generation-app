import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const BASE_URL = "https://projects.propublica.org/nonprofits/api/v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ProPublica v2 search API uses numeric category IDs (1–10), not NTEE letter codes.
// URL param: ntee[id]=N (encoded as ntee%5Bid%5D=N). Maps each NTEE major-group letter
// to its ProPublica numeric category. Client-side applyOrganizationFilters handles
// sub-code precision (e.g. "D" here, then startsWith("D") post-fetch).
const NTEE_TO_PROPUBLICA_CATEGORY: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 3, E: 4, F: 4, G: 4, H: 4,
  I: 7, J: 5, K: 5, L: 5, M: 7, N: 5, O: 5, P: 5,
  Q: 6, R: 7, S: 7, T: 7, U: 7, V: 7, W: 7,
  X: 8, Y: 9, Z: 10,
};

export type ProPublicaSearchParams = {
  q?: string;
  nteeCode?: string;
  state?: string;
  minRevenue?: number;
  maxRevenue?: number;
  page?: number;
};

export type ProPublicaOrg = {
  ein: string;
  name: string;
  ntee_code: string | null;
  state: string | null;
  income_amount: number | null;
  propublica_url: string | null;
};

export type SearchResult = {
  organizations: ProPublicaOrg[];
  total_results: number;
  num_pages: number;
  cur_page: number;
  stale?: boolean;
};

async function fetchFromProPublica(params: ProPublicaSearchParams): Promise<SearchResult> {
  const buildUrl = (includeFilters: boolean) => {
    const url = new URL(`${BASE_URL}/search.json`);
    if (params.q) url.searchParams.set("q", params.q);
    if (includeFilters) {
      if (params.nteeCode) {
        const numCategory = NTEE_TO_PROPUBLICA_CATEGORY[params.nteeCode[0].toUpperCase()];
        if (numCategory != null) url.searchParams.set("ntee[id]", String(numCategory));
      }
      // state[] causes ProPublica to 500 — post-filter via applyOrganizationFilters instead
      if (params.minRevenue != null) url.searchParams.set("min_income", String(params.minRevenue));
      if (params.maxRevenue != null) url.searchParams.set("max_income", String(params.maxRevenue));
    }
    if (params.page) url.searchParams.set("page", String(params.page));
    return url.toString();
  };

  const doFetch = (url: string) =>
    fetch(url, {
      headers: { "User-Agent": "LeadGenApp/1.0 (personal outreach tool)" },
      next: { revalidate: 0 },
    });

  const res = await doFetch(buildUrl(true));

  if (res.status === 429) throw new RateLimitError("ProPublica rate limit hit");
  if (!res.ok) throw new Error(`ProPublica error: ${res.status}`);

  const data = await res.json();
  // ProPublica returns ein as a number — normalize to string throughout
  for (const org of data.organizations ?? []) {
    org.ein = String(org.ein);
  }
  return data;
}

export async function searchOrgs(params: ProPublicaSearchParams): Promise<SearchResult> {
  try {
    const data = await fetchFromProPublica(params);

    if (data.organizations.length > 0) {
      const now = new Date();
      await db
        .insert(orgs)
        .values(
          data.organizations.map((org) => ({
            ein: org.ein,
            name: org.name,
            nteeCode: org.ntee_code ?? undefined,
            state: org.state ?? undefined,
            totalRevenue: org.income_amount != null ? String(org.income_amount) : undefined,
            propublicaUrl: org.propublica_url ?? undefined,
            cachedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: orgs.ein,
          set: {
            name: sql`excluded.name`,
            nteeCode: sql`excluded.ntee_code`,
            state: sql`excluded.state`,
            totalRevenue: sql`excluded.total_revenue`,
            cachedAt: sql`excluded.cached_at`,
          },
        });
    }

    return data;
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    throw err;
  }
}

export async function getOrgByEin(ein: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.ein, ein)).limit(1);
  return org ?? null;
}

export function applyOrganizationFilters(
  organizations: ProPublicaOrg[],
  filters: { nteeCode?: string; state?: string },
): ProPublicaOrg[] {
  return organizations.filter(
    (o) =>
      (!filters.nteeCode ||
        (filters.nteeCode.length === 1
          ? o.ntee_code?.startsWith(filters.nteeCode) === true
          : o.ntee_code === filters.nteeCode)) &&
      (!filters.state || o.state === filters.state),
  );
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

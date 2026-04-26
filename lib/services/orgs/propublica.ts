import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const BASE_URL = "https://projects.propublica.org/nonprofits/api/v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
      if (params.nteeCode) url.searchParams.set("ntee[]", params.nteeCode);
      if (params.state) url.searchParams.set("state[]", params.state);
    }
    if (params.page) url.searchParams.set("page", String(params.page));
    return url.toString();
  };

  const doFetch = (url: string) =>
    fetch(url, {
      headers: { "User-Agent": "LeadGenApp/1.0 (personal outreach tool)" },
      next: { revalidate: 0 },
    });

  let res = await doFetch(buildUrl(true));

  // ProPublica's filter endpoints are intermittently broken — fall back to keyword-only
  if (res.status === 500 && (params.nteeCode || params.state)) {
    res = await doFetch(buildUrl(false));
  }

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

    for (const org of data.organizations) {
      await db
        .insert(orgs)
        .values({
          ein: org.ein,
          name: org.name,
          nteeCode: org.ntee_code ?? undefined,
          state: org.state ?? undefined,
          totalRevenue: org.income_amount != null ? String(org.income_amount) : undefined,
          propublicaUrl: org.propublica_url ?? undefined,
          cachedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: orgs.ein,
          set: {
            name: org.name,
            nteeCode: org.ntee_code ?? undefined,
            state: org.state ?? undefined,
            totalRevenue: org.income_amount != null ? String(org.income_amount) : undefined,
            cachedAt: new Date(),
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

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

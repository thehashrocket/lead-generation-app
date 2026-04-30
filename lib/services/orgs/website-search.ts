import { env } from "@/lib/env";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

const EXCLUDED_DOMAINS = new Set([
  "propublica.org",
  "guidestar.org",
  "candid.org",
  "irs.gov",
  "charitynavigator.org",
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "wikipedia.org",
  "bloomberg.org",
  "ein-search.com",
  "bizapedia.com",
  "opengovus.com",
  "cause-iq.com",
  "foundationcenter.org",
  "idealist.org",
  "greatnonprofits.org",
]);

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isExcluded(domain: string): boolean {
  if (EXCLUDED_DOMAINS.has(domain)) return true;
  for (const excl of EXCLUDED_DOMAINS) {
    if (domain.endsWith(`.${excl}`)) return true;
  }
  return false;
}

function scoreResult(url: string, orgName: string): number {
  const domain = extractDomain(url);
  if (!domain || isExcluded(domain)) return -1;

  let score = 0;
  if (domain.endsWith(".org")) score += 2;

  const tokens = orgName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (tokens.some((t) => domain.toLowerCase().includes(t))) score += 1;

  return score;
}

export async function searchOrgWebsite(
  orgName: string,
  city: string | null,
  state: string | null,
): Promise<string | null> {
  const apiKey = env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  const q = [orgName, city, state, "nonprofit"].filter(Boolean).join(" ");
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("count", "5");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const results: Array<{ url: string }> = data.web?.results ?? [];

    let bestUrl: string | null = null;
    let bestScore = -1;
    for (const result of results) {
      const score = scoreResult(result.url, orgName);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = result.url;
      }
    }

    if (bestScore < 0 || !bestUrl) return null;

    const { origin } = new URL(bestUrl);
    return origin;
  } catch {
    return null;
  }
}

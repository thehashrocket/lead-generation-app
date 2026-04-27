import { env } from "@/lib/env";

export type EmailLookupResult = {
  email: string;
  confidence: number;
};

function extractHostname(websiteOrDomain: string): string {
  try {
    return new URL(websiteOrDomain).hostname.replace(/^www\./, "");
  } catch {
    return websiteOrDomain;
  }
}

export async function lookupEmail(
  domain: string,
  firstName: string,
  lastName: string,
): Promise<EmailLookupResult | null> {
  const apiKey = env.HUNTER_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.hunter.io/v2/email-finder");
  url.searchParams.set("domain", extractHostname(domain));
  url.searchParams.set("first_name", firstName);
  url.searchParams.set("last_name", lastName);
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const email: string | null = data.data?.email ?? null;
    const confidence: number = data.data?.score ?? 0;
    if (!email) return null;
    return { email, confidence };
  } catch {
    return null;
  }
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

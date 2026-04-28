import { db } from "@/lib/db";
import { irsFilingIndex } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const IRS_S3_BASE = "https://s3.amazonaws.com/irs-form-990";

// Normalize EIN to 9-digit string without hyphen for index lookups
function normalizeEin(ein: string): string {
  return ein.replace(/-/g, "").padStart(9, "0");
}

export async function fetchIrsXml(ein: string): Promise<string | null> {
  const normalizedEin = normalizeEin(ein);

  let filings: Array<{ objectId: string }>;
  try {
    filings = await db
      .select({ objectId: irsFilingIndex.objectId })
      .from(irsFilingIndex)
      .where(eq(irsFilingIndex.ein, normalizedEin))
      .orderBy(desc(irsFilingIndex.taxPeriod))
      .limit(5);
  } catch {
    return null; // table may not exist yet (before indexing job runs)
  }

  for (const { objectId } of filings) {
    try {
      const res = await fetch(`${IRS_S3_BASE}/${objectId}_public.xml`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.startsWith("<")) return text;
    } catch {
      continue;
    }
  }
  return null;
}

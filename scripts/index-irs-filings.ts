#!/usr/bin/env bun
/**
 * Fetches IRS Form 990 index files from the public S3 bucket and populates
 * the irs_filing_index table so the enrich route can find XML for orgs that
 * ProPublica doesn't have filing URLs for.
 *
 * Usage:
 *   bun run scripts/index-irs-filings.ts              # last 5 years
 *   bun run scripts/index-irs-filings.ts 2019 2023    # specific range
 *
 * The IRS publishes one JSON index per year at:
 *   https://s3.amazonaws.com/irs-form-990/index_YYYY.json
 * Each entry has ObjectId, EIN, TaxPeriod, FormType, OrganizationName.
 * Individual XML files live at:
 *   https://s3.amazonaws.com/irs-form-990/{ObjectId}_public.xml
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { irsFilingIndex } from "../lib/db/schema/irs-filings";
import { sql } from "drizzle-orm";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set — run: vercel env pull .env.local");
  process.exit(1);
}

const client = neon(DATABASE_URL);
const db = drizzle(client);

const IRS_INDEX_BASE = "https://s3.amazonaws.com/irs-form-990";
const BATCH_SIZE = 500;

type IrsIndexEntry = {
  ObjectId?: string;
  EIN?: string;
  TaxPeriod?: string;
  FormType?: string;
  OrganizationName?: string;
  // Some years use lowercase keys
  object_id?: string;
  ein?: string;
  tax_period?: string;
  form_type?: string;
  organization_name?: string;
};

function normalize(entry: IrsIndexEntry) {
  const objectId = entry.ObjectId ?? entry.object_id;
  const ein = (entry.EIN ?? entry.ein ?? "").replace(/-/g, "").padStart(9, "0");
  const taxPeriod = entry.TaxPeriod ?? entry.tax_period ?? null;
  const formType = entry.FormType ?? entry.form_type ?? null;
  const orgName = (entry.OrganizationName ?? entry.organization_name ?? null)?.slice(0, 200) ?? null;
  return objectId && ein ? { objectId, ein, taxPeriod, formType, orgName } : null;
}

async function indexYear(year: number): Promise<number> {
  const url = `${IRS_INDEX_BASE}/index_${year}.json`;
  console.log(`Fetching ${url} ...`);

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ${year}: HTTP ${res.status} — skipping`);
    return 0;
  }

  console.log(`  Parsing ...`);
  const raw = await res.json() as { ReturnData?: IrsIndexEntry[] } | IrsIndexEntry[];

  const entries: IrsIndexEntry[] = Array.isArray(raw)
    ? raw
    : (raw as { ReturnData?: IrsIndexEntry[] }).ReturnData ?? [];

  if (entries.length === 0) {
    console.warn(`  ${year}: no entries found — index may use a different format`);
    if (!Array.isArray(raw)) {
      console.warn(`  Top-level keys: ${Object.keys(raw as object).slice(0, 10).join(", ")}`);
    }
    return 0;
  }

  console.log(`  ${entries.length.toLocaleString()} entries — upserting in batches of ${BATCH_SIZE} ...`);

  let inserted = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE).map(normalize).filter(Boolean) as Array<{
      objectId: string; ein: string; taxPeriod: string | null; formType: string | null; orgName: string | null;
    }>;

    if (batch.length === 0) continue;

    await db
      .insert(irsFilingIndex)
      .values(batch)
      .onConflictDoUpdate({
        target: irsFilingIndex.objectId,
        set: {
          ein: sql`excluded.ein`,
          taxPeriod: sql`excluded.tax_period`,
          formType: sql`excluded.form_type`,
          orgName: sql`excluded.org_name`,
          indexedAt: sql`now()`,
        },
      });

    inserted += batch.length;
    if ((i / BATCH_SIZE) % 20 === 0) {
      process.stdout.write(`\r  ${inserted.toLocaleString()} / ${entries.length.toLocaleString()}`);
    }
  }
  console.log(`\r  ${inserted.toLocaleString()} rows upserted for ${year}`);
  return inserted;
}

async function main() {
  const currentYear = new Date().getFullYear();
  const args = process.argv.slice(2);
  const startYear = args[0] ? parseInt(args[0]) : currentYear - 4;
  const endYear = args[1] ? parseInt(args[1]) : currentYear;

  if (isNaN(startYear) || isNaN(endYear) || startYear > endYear) {
    console.error("Usage: bun run scripts/index-irs-filings.ts [startYear] [endYear]");
    process.exit(1);
  }

  console.log(`Indexing IRS 990 filings for ${startYear}–${endYear}`);

  let total = 0;
  for (let year = startYear; year <= endYear; year++) {
    total += await indexYear(year);
  }

  console.log(`\nDone. ${total.toLocaleString()} total rows upserted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

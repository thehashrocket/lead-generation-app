import { db } from "@/lib/db";
import { contacts, orgs } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { buildCsvResponse } from "@/lib/csv";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const rows = await db
    .select({
      orgName: orgs.name,
      ein: orgs.ein,
      nteeCode: orgs.nteeCode,
      state: orgs.state,
      contactName: contacts.name,
      contactTitle: contacts.title,
      contactEmail: contacts.email,
      linkedinUrl: contacts.linkedinUrl,
      capturedAt: contacts.createdAt,
    })
    .from(contacts)
    .leftJoin(orgs, eq(contacts.orgId, orgs.id));

  const headers = [
    "org_name", "ein", "ntee_code", "state",
    "contact_name", "contact_title", "contact_email", "linkedin_url", "captured_at",
  ];
  const data = rows.map((r) => [
    r.orgName, r.ein, r.nteeCode, r.state,
    r.contactName, r.contactTitle, r.contactEmail, r.linkedinUrl, r.capturedAt?.toISOString(),
  ]);

  return buildCsvResponse(headers, data, "contacts.csv");
}

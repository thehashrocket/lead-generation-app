import { db } from "@/lib/db";
import { contacts, drafts, orgs, replies, sends } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { buildCsvResponse } from "@/lib/csv";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const rows = await db
    .select({
      sentAt: sends.sentAt,
      orgName: orgs.name,
      contactName: contacts.name,
      toEmail: drafts.toEmail,
      subject: drafts.subject,
      promptVersion: drafts.promptVersion,
      model: drafts.model,
      status: sends.status,
      repliedAt: replies.receivedAt,
      classification: replies.classification,
    })
    .from(sends)
    .innerJoin(drafts, eq(sends.draftId, drafts.id))
    .innerJoin(orgs, eq(drafts.orgId, orgs.id))
    .leftJoin(contacts, eq(drafts.contactId, contacts.id))
    .leftJoin(replies, eq(replies.sendId, sends.id));

  const headers = [
    "sent_at", "org_name", "contact_name", "to_email",
    "subject", "prompt_version", "model", "status", "replied_at", "classification",
  ];
  const data = rows.map((r) => [
    r.sentAt?.toISOString(), r.orgName, r.contactName, r.toEmail,
    r.subject, r.promptVersion, r.model, r.status,
    r.repliedAt?.toISOString(), r.classification,
  ]);

  return buildCsvResponse(headers, data, "sent.csv");
}

import { db } from "@/lib/db";
import { contacts, drafts, orgs, replies, sends } from "@/lib/db/schema";
import { SentTable } from "@/components/sent/sent-table";
import { RefreshRepliesButton } from "@/components/sent/refresh-replies-button";
import { getWeeklySendCount } from "@/lib/services/sends/resend";
import { desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getSentData() {
  const rows = await db
    .select({
      sendId: sends.id,
      sentAt: sends.sentAt,
      status: sends.status,
      orgName: orgs.name,
      orgId: drafts.orgId,
      contactName: contacts.name,
      toEmail: drafts.toEmail,
      subject: drafts.subject,
      replyId: replies.id,
      replySnippet: replies.snippet,
      replyFrom: replies.fromEmail,
      replyFromName: replies.fromName,
      replyClassification: replies.classification,
      repliedAt: replies.receivedAt,
    })
    .from(sends)
    .innerJoin(drafts, eq(sends.draftId, drafts.id))
    .innerJoin(orgs, eq(drafts.orgId, orgs.id))
    .leftJoin(contacts, eq(drafts.contactId, contacts.id))
    .leftJoin(replies, eq(replies.sendId, sends.id))
    .orderBy(desc(sends.sentAt));

  return rows;
}

export default async function SentPage() {
  const [rows, weekCount] = await Promise.all([getSentData(), getWeeklySendCount()]);

  const replied = rows.filter((r) => r.replyClassification === "human");
  const others = rows.filter((r) => r.replyClassification !== "human");
  const sorted = [...replied, ...others];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sent</h1>
          <p className="text-sm text-gray-500">
            {weekCount}/50 emails sent this week
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshRepliesButton />
          <Link href="/api/export/sent" download>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </Link>
        </div>
      </div>

      <SentTable rows={sorted} />
    </div>
  );
}

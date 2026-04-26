"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

type SentRow = {
  sendId: string;
  sentAt: Date | null;
  status: string | null;
  orgName: string;
  contactName: string | null;
  toEmail: string | null;
  subject: string;
  replyId: string | null;
  replySnippet: string | null;
  replyFrom: string | null;
  replyFromName: string | null;
  replyClassification: string | null;
  repliedAt: Date | null;
};

function StatusBadge({ row }: { row: SentRow }) {
  if (row.replyClassification === "human") {
    return <Badge className="bg-green-100 text-green-800 border-green-200">Replied</Badge>;
  }
  if (row.replyClassification && row.replyClassification !== "unknown") {
    return <Badge variant="secondary" className="text-xs">Auto-reply</Badge>;
  }
  if (row.status === "delivered") {
    return <Badge variant="outline" className="text-blue-600">Sent</Badge>;
  }
  if (row.status === "bounced") {
    return <Badge variant="destructive" className="text-xs">Bounced</Badge>;
  }
  return <Badge variant="secondary">No Reply</Badge>;
}

export function SentTable({ rows }: { rows: SentRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        No emails sent yet. Use the Search view to find orgs and draft emails.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-6" />
          <TableHead className="text-xs">Organization</TableHead>
          <TableHead className="text-xs">To</TableHead>
          <TableHead className="text-xs">Subject</TableHead>
          <TableHead className="text-xs">Sent</TableHead>
          <TableHead className="text-xs">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <>
            <TableRow key={row.sendId} className="text-sm">
              <TableCell>
                {row.replyId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => toggle(row.sendId)}
                    aria-label={expanded.has(row.sendId) ? "Collapse reply" : "View thread"}
                  >
                    {expanded.has(row.sendId) ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </TableCell>
              <TableCell className="font-medium">{row.orgName}</TableCell>
              <TableCell className="text-gray-500">{row.toEmail ?? row.contactName ?? "—"}</TableCell>
              <TableCell className="max-w-xs truncate text-gray-700">{row.subject}</TableCell>
              <TableCell className="text-gray-400 whitespace-nowrap">
                {row.sentAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </TableCell>
              <TableCell>
                <StatusBadge row={row} />
              </TableCell>
            </TableRow>

            {expanded.has(row.sendId) && row.replySnippet && (
              <TableRow key={`${row.sendId}-reply`}>
                <TableCell />
                <TableCell colSpan={5}>
                  <div className="ml-2 rounded border-l-2 border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      Reply from{" "}
                      {row.replyFromName
                        ? `${row.replyFromName} (${row.replyFrom})`
                        : row.replyFrom}{" "}
                      on{" "}
                      {row.repliedAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-sm text-gray-600">{row.replySnippet}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
      </TableBody>
    </Table>
  );
}

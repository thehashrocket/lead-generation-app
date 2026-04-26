import { db } from "@/lib/db";
import { sends } from "@/lib/db/schema";
import { gt } from "drizzle-orm";
import { NextResponse } from "next/server";

// Admin escape hatch: zero out this week's send count by deleting test sends
// Only use in development/testing
export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  const monday = getMondayOfCurrentWeek();
  await db.delete(sends).where(gt(sends.sentAt, monday));
  return NextResponse.json({ ok: true });
}

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

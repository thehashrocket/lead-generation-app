import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";
import { requireWebSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
  toEmail: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const unauth = await requireWebSession(req);
  if (unauth) return unauth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await db
    .update(drafts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(drafts.id, id));

  return NextResponse.json({ ok: true });
}

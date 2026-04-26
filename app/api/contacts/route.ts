import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { validateApiToken } from "@/lib/auth/tokens";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ALLOWED_EXTENSION_ORIGIN_PREFIX = "chrome-extension://";

const bodySchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const origin = req.headers.get("origin") ?? "";

  if (!origin.startsWith(ALLOWED_EXTENSION_ORIGIN_PREFIX)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const ua = req.headers.get("user-agent") ?? undefined;
  const valid = await validateApiToken(token, ip, ua);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const missing = parsed.error.issues[0]?.path.join(".") ?? "unknown";
    return NextResponse.json({ error: `Missing required field: ${missing}` }, { status: 400 });
  }

  const { name, title, company, linkedinUrl } = parsed.data;

  if (linkedinUrl) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.linkedinUrl, linkedinUrl))
      .limit(1);
    if (existing) {
      return NextResponse.json({ id: existing.id, status: "duplicate" }, { status: 200 });
    }
  }

  const [created] = await db
    .insert(contacts)
    .values({ name, title, linkedinUrl })
    .returning({ id: contacts.id });

  logger.info({ event: "contact_created", id: created.id }, "Extension contact saved");
  return NextResponse.json({ id: created.id, status: "created" }, { status: 201 });
}

/**
 * Integration tests for sendDraft() — requires a real Neon dev branch.
 * Run with: DATABASE_URL=<dev-branch-url> bun test sends.integration
 *
 * These tests skip automatically if DATABASE_URL is not set, so they are safe
 * to include in the default test run (they'll report as skipped, not failed).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const hasDb = !!process.env.DATABASE_URL;
const describeOrSkip = hasDb ? describe : describe.skip;

describeOrSkip("sendDraft() integration", () => {
  // We mock the Resend client so we don't send real emails, but keep the DB real
  vi.mock("resend", () => ({
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "resend-msg-test" }, error: null }),
      },
    })),
  }));

  let orgId: string;
  let draftId: string;

  beforeEach(async () => {
    // Seed a minimal org + draft for each test so tests are independent
    const { db: testDb } = await import("@/lib/db");
    const { orgs, drafts, sends, suppressions } = await import("@/lib/db/schema");

    const [org] = await testDb
      .insert(orgs)
      .values({ ein: `99-${Date.now().toString().slice(-7)}`, name: "Test Org" })
      .returning({ id: orgs.id });
    orgId = org.id;

    const [draft] = await testDb
      .insert(drafts)
      .values({ orgId, subject: "Test subject", body: "Test body" })
      .returning({ id: drafts.id });
    draftId = draft.id;
  });

  afterEach(async () => {
    const { db: testDb } = await import("@/lib/db");
    const { orgs, drafts, sends, suppressions } = await import("@/lib/db/schema");
    const { eq, inArray } = await import("drizzle-orm");

    // Clean up test rows in dependency order
    await testDb.delete(sends).where(eq(sends.draftId, draftId));
    await testDb.delete(drafts).where(eq(drafts.id, draftId));
    await testDb.delete(orgs).where(eq(orgs.id, orgId));
    await testDb.delete(suppressions).where(eq(suppressions.email, "suppressed@test.example"));
    await testDb.delete(suppressions).where(eq(suppressions.domain, "blocked.example"));
  });

  it("creates a send row with verp_token and idempotency_key on success", async () => {
    const { sendDraft } = await import("@/lib/services/sends/resend");
    const { db: testDb } = await import("@/lib/db");
    const { sends } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const result = await sendDraft(draftId, "recipient@test.example");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [send] = await testDb.select().from(sends).where(eq(sends.id, result.sendId));
    expect(send.verpToken).toBeTruthy();
    expect(send.idempotencyKey).toBeTruthy();
    expect(send.resendMessageId).toBe("resend-msg-test");
  });

  it("blocks send to suppressed email address", async () => {
    const { sendDraft } = await import("@/lib/services/sends/resend");
    const { db: testDb } = await import("@/lib/db");
    const { suppressions } = await import("@/lib/db/schema");

    await testDb.insert(suppressions).values({
      email: "suppressed@test.example",
      reason: "bounced",
      source: "webhook",
    });

    const result = await sendDraft(draftId, "suppressed@test.example");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("suppressed");
  });

  it("blocks send to suppressed domain", async () => {
    const { sendDraft } = await import("@/lib/services/sends/resend");
    const { db: testDb } = await import("@/lib/db");
    const { suppressions } = await import("@/lib/db/schema");

    await testDb.insert(suppressions).values({
      domain: "blocked.example",
      reason: "complained",
      source: "webhook",
    });

    const result = await sendDraft(draftId, "anyone@blocked.example");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("suppressed");
  });

  it("returns draft_not_found for nonexistent draftId", async () => {
    const { sendDraft } = await import("@/lib/services/sends/resend");
    const result = await sendDraft("nonexistent-draft-id", "test@example.com");
    expect(result.ok).toBe(false);
  });

  it("enforces weekly send cap at 50", async () => {
    const { sendDraft } = await import("@/lib/services/sends/resend");
    const { db: testDb } = await import("@/lib/db");
    const { sends } = await import("@/lib/db/schema");

    // Seed 50 send rows this week so the cap is already hit
    await testDb.insert(sends).values(
      Array.from({ length: 50 }, () => ({
        draftId,
        verpToken: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        status: "queued" as const,
        sentAt: new Date(),
      })),
    );

    const result = await sendDraft(draftId, "test@example.com");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("cap_reached");
  });
});

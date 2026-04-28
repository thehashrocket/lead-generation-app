import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDb = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
const mockSession = vi.hoisted(() => ({ requireWebSession: vi.fn() }));
const mockGenerate = vi.hoisted(() => ({ generateDraft: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({ contacts: {}, drafts: {}, orgs: {} }));
vi.mock("@/lib/auth/session", () => mockSession);
vi.mock("@/lib/services/drafts/generate", () => mockGenerate);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { POST } from "@/app/api/drafts/generate/route";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/drafts/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ORG = {
  id: "org-1",
  ein: "12-3456789",
  name: "Test Org",
  nteeCode: "A01",
  state: "CA",
  totalRevenue: 100000,
  missionText: "We do good.",
  programsJson: null,
};

const DRAFT_ROW = { id: "draft-1", subject: "Hello", body: "Body text" };

beforeEach(() => {
  mockSession.requireWebSession.mockResolvedValue(null);
  mockGenerate.generateDraft.mockResolvedValue({
    ok: true,
    subject: "Hello",
    body: "Body text",
    model: "gpt-4o",
    capReached: false,
  });
});

describe("POST /api/drafts/generate — toEmail regression", () => {
  it("returns toEmail and emailConfidence when contact has email", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([ORG]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ email: "cfo@testorg.org", emailConfidence: 75 }]) }) }) });
    mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([DRAFT_ROW]) }) });

    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.toEmail).toBe("cfo@testorg.org");
    expect(data.emailConfidence).toBe(75);
  });

  it("returns toEmail null when no contact found", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([ORG]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });
    mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([DRAFT_ROW]) }) });

    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.toEmail).toBeNull();
    expect(data.emailConfidence).toBeNull();
  });

  it("returns toEmail null when contact has no email yet", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([ORG]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ email: null, emailConfidence: null }]) }) }) });
    mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([DRAFT_ROW]) }) });

    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.toEmail).toBeNull();
    expect(data.emailConfidence).toBeNull();
  });

  it("returns 401 when session is invalid", async () => {
    mockSession.requireWebSession.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when org is not found", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });

    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await POST(makeReq({ ein: "12-3456789" })); // missing orgId
    expect(res.status).toBe(400);
  });

  it("returns 402 when generateDraft fails with capReached", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([ORG]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });
    mockGenerate.generateDraft.mockResolvedValueOnce({ ok: false, error: "Cap reached", capReached: true });

    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    const data = await res.json();
    expect(res.status).toBe(402);
    expect(data.capReached).toBe(true);
  });

  it("returns 500 when generateDraft fails without capReached", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([ORG]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });
    mockGenerate.generateDraft.mockResolvedValueOnce({ ok: false, error: "API error", capReached: false });

    const res = await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    expect(res.status).toBe(500);
  });

  it("parses programsJson and passes programs array to generateDraft", async () => {
    const orgWithPrograms = { ...ORG, programsJson: '["Education","Health"]' };
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([orgWithPrograms]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });
    mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([DRAFT_ROW]) }) });

    await POST(makeReq({ orgId: "org-1", ein: "12-3456789" }));
    expect(mockGenerate.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ programs: ["Education", "Health"] }),
    );
  });
});

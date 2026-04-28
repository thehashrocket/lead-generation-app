import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDb = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
const mockSession = vi.hoisted(() => ({ requireWebSession: vi.fn() }));
const mockFetch990 = vi.hoisted(() => ({ fetch990Xml: vi.fn(), parse990Xml: vi.fn() }));
const mockGlobalFetch = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({ orgs: {} }));
vi.mock("@/lib/auth/session", () => mockSession);
vi.mock("@/lib/services/orgs/990-parser", () => mockFetch990);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

vi.stubGlobal("fetch", mockGlobalFetch);

import { GET } from "@/app/api/orgs/[ein]/enrich/route";

function makeReq(ein: string) {
  return new NextRequest(`http://localhost/api/orgs/${ein}/enrich`);
}

function makeParams(ein: string) {
  return { params: Promise.resolve({ ein }) };
}

function selectReturning(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
      }),
    }),
  };
}

const ORG_BASE = { id: "org-1", ein: "123456789", name: "Test Org", website: null, missionText: null, programsJson: null };

beforeEach(() => {
  vi.resetAllMocks();
  mockSession.requireWebSession.mockResolvedValue(null);
  mockDb.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  mockGlobalFetch.mockResolvedValue({ ok: true, json: async () => ({ organization: { website: null } }) });
  mockFetch990.fetch990Xml.mockResolvedValue(null);
});

describe("GET /api/orgs/[ein]/enrich", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.requireWebSession.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid EIN format", async () => {
    const res = await GET(makeReq("bad-ein"), makeParams("bad-ein"));
    expect(res.status).toBe(400);
  });

  it("returns nulls object when org not found", async () => {
    mockDb.select = selectReturning([]).select;
    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.missionText).toBeNull();
    expect(data.programs).toEqual([]);
    expect(data.namedContact).toBeNull();
  });

  it("skips fetchOrgWebsite when org already has a website", async () => {
    const orgWithWebsite = { ...ORG_BASE, website: "https://example.org", missionText: "We help." };
    mockDb.select = selectReturning([orgWithWebsite]).select;
    mockFetch990.fetch990Xml.mockResolvedValue(null);

    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    expect(mockGlobalFetch).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("fetches and saves website when org.website is null", async () => {
    mockDb.select = selectReturning([ORG_BASE]).select;
    mockGlobalFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ organization: { website: "https://fetched.org" } }),
    });
    mockFetch990.fetch990Xml.mockResolvedValue(null);

    await GET(makeReq("12-3456789"), makeParams("12-3456789"));

    expect(mockGlobalFetch).toHaveBeenCalledWith(
      expect.stringContaining("/organizations/123456789.json"),
      expect.any(Object),
    );
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("returns cached missionText early without fetching 990", async () => {
    const orgCached = { ...ORG_BASE, missionText: "Cached mission.", programsJson: '["prog A"]' };
    mockDb.select = selectReturning([orgCached]).select;

    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    const data = await res.json();

    expect(mockFetch990.fetch990Xml).not.toHaveBeenCalled();
    expect(data.missionText).toBe("Cached mission.");
    expect(data.programs).toEqual(["prog A"]);
  });

  it("returns limited:true when no 990 XML found", async () => {
    mockDb.select = selectReturning([ORG_BASE]).select;
    mockFetch990.fetch990Xml.mockResolvedValue(null);

    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    const data = await res.json();
    expect(data.limited).toBe(true);
    expect(data.missionText).toBeNull();
  });

  it("parses 990 XML and updates DB when XML is found", async () => {
    mockDb.select = selectReturning([ORG_BASE]).select;
    mockFetch990.fetch990Xml.mockResolvedValue("<xml>...</xml>");
    mockFetch990.parse990Xml.mockReturnValue({
      missionText: "Parsed mission",
      programs: ["prog 1"],
      namedContact: "Jane Doe",
      pathMatched: "ScheduleO",
    });

    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    const data = await res.json();

    expect(mockDb.update).toHaveBeenCalled();
    expect(data.missionText).toBe("Parsed mission");
    expect(data.programs).toEqual(["prog 1"]);
    expect(data.namedContact).toBe("Jane Doe");
  });

  it("handles ProPublica non-ok response and continues without website", async () => {
    mockDb.select = selectReturning([ORG_BASE]).select;
    mockGlobalFetch.mockResolvedValueOnce({ ok: false });
    mockFetch990.fetch990Xml.mockResolvedValue(null);

    const res = await GET(makeReq("12-3456789"), makeParams("12-3456789"));
    expect(res.status).toBe(200);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- hoisted mocks ---
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const mockEnv = vi.hoisted(() => ({
  HUNTER_API_KEY: "test-key" as string | undefined,
}));
const mockSession = vi.hoisted(() => ({ requireWebSession: vi.fn() }));
const mockLookup = vi.hoisted(() => ({ lookupEmail: vi.fn(), splitName: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  contacts: {},
  orgs: {},
  usageLog: { day: "day", hunterCalls: "hunter_calls" },
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/auth/session", () => mockSession);
vi.mock("@/lib/services/contacts/email-lookup", () => mockLookup);

import { GET } from "@/app/api/contacts/email-lookup/route";

function makeReq(orgId?: string) {
  const url = orgId
    ? `http://localhost/api/contacts/email-lookup?orgId=${orgId}`
    : "http://localhost/api/contacts/email-lookup";
  return new NextRequest(url);
}

function buildSelectChain(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  mockEnv.HUNTER_API_KEY = "test-key";
  mockSession.requireWebSession.mockResolvedValue(null);
  mockLookup.splitName.mockReturnValue({ firstName: "Jane", lastName: "Smith" });
  mockLookup.lookupEmail.mockResolvedValue({ email: "jane@example.org", confidence: 80 });
});

describe("GET /api/contacts/email-lookup", () => {
  it("returns 401 when session is invalid", async () => {
    mockSession.requireWebSession.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await GET(makeReq("org-1"));
    expect(res.status).toBe(401);
  });

  it("returns 501 when HUNTER_API_KEY is not set", async () => {
    mockEnv.HUNTER_API_KEY = undefined;
    const res = await GET(makeReq("org-1"));
    expect(res.status).toBe(501);
  });

  it("returns 400 when orgId is missing", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });

  it("returns 404 when org is not found", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    });
    const res = await GET(makeReq("missing-org"));
    expect(res.status).toBe(404);
  });

  it("returns existing email without calling Hunter (credit guard)", async () => {
    let callCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([{ id: "org-1", name: "Org", website: "org.org" }]);
            return Promise.resolve([{ id: "c1", name: "Jane Smith", email: "jane@org.org", emailConfidence: 90, linkedinUrl: null }]);
          }),
        }),
      }),
    }));
    const res = await GET(makeReq("org-1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.email).toBe("jane@org.org");
    expect(mockLookup.lookupEmail).not.toHaveBeenCalled();
  });

  it("returns 402 quota_reached when monthly usage >= 50", async () => {
    let callCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([{ id: "org-1", name: "Org", website: "org.org" }]);
            return Promise.resolve([{ id: "c1", name: "Jane Smith", email: null, emailConfidence: null, linkedinUrl: null }]);
          }),
        }),
        // SUM query
      }),
    }));
    // Override for the SUM query — add a select without limit
    const origSelect = mockDb.select;
    mockDb.select = vi.fn().mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "org-1", name: "Org", website: "org.org" }]) }),
      }),
    })).mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "c1", name: "Jane", email: null, emailConfidence: null, linkedinUrl: null }]) }),
      }),
    })).mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: "50" }]),
      }),
    }));
    const res = await GET(makeReq("org-1"));
    expect(res.status).toBe(402);
  });

  it("returns no_domain when org.website is null", async () => {
    let callCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([{ id: "org-1", name: "Org", website: null }]);
            return Promise.resolve([{ id: "c1", name: "Jane", email: null, emailConfidence: null, linkedinUrl: null }]);
          }),
        }),
      }),
    }));
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "o1", name: "Org", website: null }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "c1", name: "Jane", email: null, emailConfidence: null, linkedinUrl: null }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ total: "0" }]) }) });
    const res = await GET(makeReq("org-1"));
    const data = await res.json();
    expect(data.reason).toBe("no_domain");
  });

  it("returns not_found when Hunter returns null", async () => {
    mockLookup.lookupEmail.mockResolvedValueOnce(null);
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "o1", name: "Org", website: "org.org" }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "c1", name: "Jane", email: null, emailConfidence: null, linkedinUrl: null }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ total: "0" }]) }) });
    mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) });
    mockDb.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    const res = await GET(makeReq("org-1"));
    const data = await res.json();
    expect(data.reason).toBe("not_found");
  });

  it("returns email and confidence on happy path", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "o1", name: "Org", website: "org.org" }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "c1", name: "Jane Smith", email: null, emailConfidence: null, linkedinUrl: null }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ total: "0" }]) }) });
    mockDb.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    mockDb.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const res = await GET(makeReq("o1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.email).toBe("jane@example.org");
    expect(data.confidence).toBe(80);
  });

  it("returns 500 when contact cannot be found or created after conflict", async () => {
    mockDb.select = vi.fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "o1", name: "Org", website: "org.org" }]) }) }) })
      // first contact select: empty
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) })
      // re-fetch after conflict: also empty (race condition lost + DB error)
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });
    // insert returns nothing (conflict)
    mockDb.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    });
    const res = await GET(makeReq("o1"));
    expect(res.status).toBe(500);
  });
});

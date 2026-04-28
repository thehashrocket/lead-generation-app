import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  requireWebSession: vi.fn().mockResolvedValue(null), // null = authenticated
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({ orgs: {} }));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

const { mockSearchOrgs, mockApplyFilters } = vi.hoisted(() => ({
  mockSearchOrgs: vi.fn(),
  mockApplyFilters: vi.fn((orgs: unknown[]) => orgs),
}));

vi.mock("@/lib/services/orgs/propublica", () => ({
  searchOrgs: mockSearchOrgs,
  applyOrganizationFilters: mockApplyFilters,
  RateLimitError: class RateLimitError extends Error {
    constructor(msg: string) { super(msg); this.name = "RateLimitError"; }
  },
}));

import { GET } from "@/app/api/search/route";

function makeSearchRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyFilters.mockImplementation((orgs: unknown[]) => orgs);
    mockSearchOrgs.mockResolvedValue({
      organizations: [],
      total_results: 0,
      num_pages: 0,
      cur_page: 0,
    });
  });

  it("returns 400 when q is missing — regression: bare ProPublica URL caused stale fallback", async () => {
    const req = makeSearchRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("q is required");
  });

  it("returns 400 when q is empty string", async () => {
    const req = makeSearchRequest({ q: "" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with results when q is provided", async () => {
    mockSearchOrgs.mockResolvedValue({
      organizations: [{ ein: "123", name: "Test Org", ntee_code: "E310", state: "CA", income_amount: null, propublica_url: null }],
      total_results: 1,
      num_pages: 1,
      cur_page: 0,
    });
    const req = makeSearchRequest({ q: "health" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizations).toHaveLength(1);
  });

  it("passes through ProPublica num_pages and total_results — regression: was hardcoded to num_pages:1", async () => {
    mockSearchOrgs.mockResolvedValue({
      organizations: [
        { ein: "111", name: "Org A", ntee_code: "D20", state: "CA", income_amount: null, propublica_url: null },
        { ein: "222", name: "Org B", ntee_code: "D20", state: "TX", income_amount: null, propublica_url: null },
      ],
      total_results: 47,
      num_pages: 2,
      cur_page: 0,
    });
    const req = makeSearchRequest({ q: "animal", nteeCode: "D20" });
    const res = await GET(req);
    const body = await res.json();
    expect(body.total_results).toBe(47);
    expect(body.num_pages).toBe(2);
    expect(body.cur_page).toBe(0);
  });

  it("forwards page param to searchOrgs", async () => {
    mockSearchOrgs.mockResolvedValue({
      organizations: [],
      total_results: 47,
      num_pages: 2,
      cur_page: 1,
    });
    const req = makeSearchRequest({ q: "animal", page: "1" });
    const res = await GET(req);
    const body = await res.json();
    expect(body.cur_page).toBe(1);
    expect(mockSearchOrgs).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });
});

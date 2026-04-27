import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(null),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({ orgs: {} }));

import { searchOrgs, applyOrganizationFilters, RateLimitError } from "@/lib/services/orgs/propublica";

const ORG_D20 = { ein: "11-1111111", name: "Animal Rescue A", ntee_code: "D20", state: "TX", income_amount: 100000, propublica_url: null };
const ORG_P20 = { ein: "22-2222222", name: "Human Services B", ntee_code: "P20", state: "TX", income_amount: 200000, propublica_url: null };
const ORG_D20_CA = { ein: "33-3333333", name: "Animal Rescue C", ntee_code: "D20", state: "CA", income_amount: 300000, propublica_url: null };
const ORG_NULL = { ein: "44-4444444", name: "Unknown Type", ntee_code: null, state: "TX", income_amount: 50000, propublica_url: null };

describe("searchOrgs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when ProPublica returns 500 — regression: no silent unfiltered retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false }));
    await expect(searchOrgs({ nteeCode: "D20" })).rejects.toThrow("ProPublica error: 500");
  });

  it("throws RateLimitError when ProPublica returns 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 429, ok: false }));
    await expect(searchOrgs({ nteeCode: "D20" })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("returns organizations and normalizes EIN to string on 200 OK", async () => {
    const apiOrg = { ein: 123456789, name: "Test Org", ntee_code: "D20", state: "TX", income_amount: 50000, propublica_url: null };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({
          organizations: [apiOrg],
          total_results: 1,
          num_pages: 1,
          cur_page: 0,
        }),
      }),
    );
    const result = await searchOrgs({ nteeCode: "D20" });
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].ein).toBe("123456789"); // number → string normalization
  });
});

describe("applyOrganizationFilters", () => {
  const orgs = [ORG_D20, ORG_P20, ORG_D20_CA, ORG_NULL];

  it("returns all orgs when no filters set", () => {
    expect(applyOrganizationFilters(orgs, {})).toHaveLength(4);
  });

  it("filters by nteeCode exact match", () => {
    const result = applyOrganizationFilters(orgs, { nteeCode: "D20" });
    expect(result).toHaveLength(2);
    expect(result.every((o) => o.ntee_code === "D20")).toBe(true);
  });

  it("excludes orgs with null ntee_code when nteeCode filter is set", () => {
    const result = applyOrganizationFilters(orgs, { nteeCode: "D20" });
    expect(result.every((o) => o.ntee_code !== null)).toBe(true);
  });

  it("filters by state exact match", () => {
    const result = applyOrganizationFilters(orgs, { state: "TX" });
    expect(result).toHaveLength(3);
    expect(result.every((o) => o.state === "TX")).toBe(true);
  });

  it("applies nteeCode and state filters together (AND semantics)", () => {
    const result = applyOrganizationFilters(orgs, { nteeCode: "D20", state: "TX" });
    expect(result).toHaveLength(1);
    expect(result[0].ein).toBe("11-1111111");
  });

  it("returns empty array when no orgs match", () => {
    const result = applyOrganizationFilters(orgs, { nteeCode: "Z99" });
    expect(result).toHaveLength(0);
  });
});

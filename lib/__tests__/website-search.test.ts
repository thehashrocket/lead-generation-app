import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnv = vi.hoisted(() => ({ env: { BRAVE_SEARCH_API_KEY: "test-key" } }));
const mockGlobalFetch = vi.fn();

vi.mock("@/lib/env", () => mockEnv);
vi.stubGlobal("fetch", mockGlobalFetch);

import { searchOrgWebsite } from "@/lib/services/orgs/website-search";

function braveResponse(urls: string[]) {
  return {
    ok: true,
    json: async () => ({
      web: { results: urls.map((url) => ({ url })) },
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockEnv.env.BRAVE_SEARCH_API_KEY = "test-key";
});

describe("searchOrgWebsite", () => {
  it("returns null when BRAVE_SEARCH_API_KEY is absent", async () => {
    mockEnv.env.BRAVE_SEARCH_API_KEY = undefined as unknown as string;
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBeNull();
    expect(mockGlobalFetch).not.toHaveBeenCalled();
  });

  it("returns null when Brave API returns non-ok response", async () => {
    mockGlobalFetch.mockResolvedValueOnce({ ok: false });
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockGlobalFetch.mockRejectedValueOnce(new Error("network error"));
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBeNull();
  });

  it("returns null when results array is empty", async () => {
    mockGlobalFetch.mockResolvedValueOnce(braveResponse([]));
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBeNull();
  });

  it("returns null when all results are excluded domains", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse([
        "https://www.propublica.org/nonprofit/test",
        "https://guidestar.org/profile/12-3456789",
        "https://linkedin.com/company/test-org",
      ]),
    );
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBeNull();
  });

  it("returns origin of best .org result", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse(["https://www.testorg.org/about", "https://testorg.com/home"]),
    );
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBe("https://www.testorg.org");
  });

  it("prefers .org over .com when both present", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse(["https://testorg.com", "https://testorg.org"]),
    );
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBe("https://testorg.org");
  });

  it("falls back to .com when no .org result available", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse(["https://testorg.com/home"]),
    );
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBe("https://testorg.com");
  });

  it("excludes subdomain of excluded domain", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse(["https://nonprofit.linkedin.com/test"]),
    );
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBeNull();
  });

  it("boosts results where org name token appears in domain", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse([
        "https://unrelated.org",
        "https://foodbank.org", // 'foodbank' matches org name token
      ]),
    );
    const result = await searchOrgWebsite("Seattle Food Bank", "Seattle", "WA");
    expect(result).toBe("https://foodbank.org");
  });

  it("includes city and state in search query", async () => {
    mockGlobalFetch.mockResolvedValueOnce(braveResponse(["https://example.org"]));
    await searchOrgWebsite("Test Org", "Portland", "OR");
    const calledUrl = mockGlobalFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("Portland");
    expect(calledUrl).toContain("OR");
    expect(calledUrl).toContain("nonprofit");
  });

  it("works when city and state are null", async () => {
    mockGlobalFetch.mockResolvedValueOnce(braveResponse(["https://example.org"]));
    const result = await searchOrgWebsite("Test Org", null, null);
    expect(result).toBe("https://example.org");
  });

  it("returns only the origin (no path)", async () => {
    mockGlobalFetch.mockResolvedValueOnce(
      braveResponse(["https://www.example.org/about/mission?ref=google"]),
    );
    const result = await searchOrgWebsite("Test Org", "Seattle", "WA");
    expect(result).toBe("https://www.example.org");
    expect(result).not.toContain("/about");
  });
});

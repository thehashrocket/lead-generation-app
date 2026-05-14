import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));
vi.mock("@/lib/db/schema", () => ({ usageLog: {} }));

// Mock the cost-cap module so extractWithLLM tests don't need a DB.
vi.mock("@/lib/services/llm/cost-cap", () => ({
  reserveWithEstimate: vi.fn(),
  reconcileBudget: vi.fn().mockResolvedValue(undefined),
  recordFailedCost: vi.fn().mockResolvedValue(undefined),
  estimateCostUsd: vi.fn().mockReturnValue(0.005),
}));

// Mock the ai package (gateway + generateText).
const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  gateway: vi.fn((m: string) => m),
  generateText: (args: unknown) => mockGenerateText(args),
  Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
}));

import {
  extractText,
  pickBestPage,
  extractWithLLM,
  enrichOrgFromWebsite,
  isCooledDown,
} from "@/lib/services/orgs/website-enrichment";
import { reserveWithEstimate } from "@/lib/services/llm/cost-cap";

const reserveMock = reserveWithEstimate as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("extractText", () => {
  it("strips <script> blocks and their contents", () => {
    const html = "<p>Hello</p><script>alert('x')</script><p>World</p>";
    const out = extractText(html);
    expect(out).not.toContain("alert");
    expect(out).toContain("Hello");
    expect(out).toContain("World");
  });

  it("strips <style> and <noscript> blocks", () => {
    const html = "<style>.x{color:red}</style><noscript>no js</noscript><p>Real</p>";
    const out = extractText(html);
    expect(out).not.toContain("color:red");
    expect(out).not.toContain("no js");
    expect(out).toContain("Real");
  });

  it("decodes named HTML entities", () => {
    const html = "<p>Tom &amp; Jerry &lt;3 &quot;cheese&quot;</p>";
    expect(extractText(html)).toBe('Tom & Jerry <3 "cheese"');
  });

  it("decodes numeric entities", () => {
    const html = "<p>Don&#39;t panic &#8217;</p>";
    expect(extractText(html)).toBe("Don't panic ’");
  });

  it("collapses runs of whitespace to single spaces", () => {
    const html = "<p>A     B\n\n\n\tC</p>";
    expect(extractText(html)).toBe("A B C");
  });

  it("caps output at 8000 chars", () => {
    const big = "<p>" + "a".repeat(20_000) + "</p>";
    expect(extractText(big).length).toBeLessThanOrEqual(8000);
  });

  it("returns empty string for empty input", () => {
    expect(extractText("")).toBe("");
  });
});

describe("pickBestPage", () => {
  it("returns first path that yields >=500 chars", async () => {
    const longBody = "x".repeat(800);
    const fetchMock = vi.fn(async (url: string) => {
      // /about returns content; others 404
      if (String(url).endsWith("/about")) {
        return new Response(`<p>${longBody}</p>`, { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pickBestPage("https://example.org");
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://example.org/about");
    expect(result?.text.length).toBeGreaterThanOrEqual(500);
  });

  it("returns null when no path yields enough content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<p>short</p>", { status: 200 })));
    const result = await pickBestPage("https://example.org");
    expect(result).toBeNull();
  });

  it("returns null when website URL is invalid", async () => {
    const result = await pickBestPage("not a url");
    expect(result).toBeNull();
  });

  it("returns null when every fetch returns 4xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    const result = await pickBestPage("https://example.org");
    expect(result).toBeNull();
  });
});

describe("extractWithLLM", () => {
  beforeEach(() => {
    reserveMock.mockResolvedValue({ kind: "allowed", reservation: 0.005 });
  });

  it("returns success with valid schema on happy path", async () => {
    mockGenerateText.mockResolvedValue({
      output: { missionText: "We rescue dogs and find them homes.", programs: ["Spay & Neuter Clinic", "Adoption Events"] },
      usage: { inputTokens: 1000, outputTokens: 100 },
    });

    const result = await extractWithLLM("a".repeat(600), "Doggos Inc");
    expect(result).toEqual({
      kind: "success",
      missionText: "We rescue dogs and find them homes.",
      programs: ["Spay & Neuter Clinic", "Adoption Events"],
    });
  });

  it("returns cap_reached when reservation is denied", async () => {
    reserveMock.mockResolvedValue({ kind: "cap_reached", remaining: 0 });
    const result = await extractWithLLM("a".repeat(600), "Org");
    expect(result).toEqual({ kind: "cap_reached" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns extract_failed when LLM throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("gateway down"));
    const result = await extractWithLLM("a".repeat(600), "Org");
    expect(result).toEqual({ kind: "extract_failed" });
  });

  it("returns extract_failed when LLM returns schema-invalid output", async () => {
    mockGenerateText.mockResolvedValue({
      output: { missionText: "x", programs: [] }, // missionText too short
      usage: { inputTokens: 100, outputTokens: 10 },
    });
    const result = await extractWithLLM("a".repeat(600), "Org");
    expect(result).toEqual({ kind: "extract_failed" });
  });

  it("returns extract_failed when input text is too thin", async () => {
    const result = await extractWithLLM("short", "Org");
    expect(result).toEqual({ kind: "extract_failed" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

describe("enrichOrgFromWebsite", () => {
  beforeEach(() => {
    reserveMock.mockResolvedValue({ kind: "allowed", reservation: 0.005 });
  });

  it("returns no_website status when website is null", async () => {
    const result = await enrichOrgFromWebsite("Org", null);
    expect(result.status).toBe("no_website");
    expect(result.missionText).toBeNull();
  });

  it("returns fetch_failed when no page yields content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const result = await enrichOrgFromWebsite("Org", "https://example.org");
    expect(result.status).toBe("fetch_failed");
  });

  it("returns success when scrape + extraction both succeed", async () => {
    const longBody = "x".repeat(800);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/about")) {
          return new Response(`<p>${longBody}</p>`, { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );
    mockGenerateText.mockResolvedValue({
      output: { missionText: "We exist to do good things.", programs: ["Reading Tutors"] },
      usage: { inputTokens: 500, outputTokens: 80 },
    });

    const result = await enrichOrgFromWebsite("Goodness Org", "https://example.org");
    expect(result.status).toBe("success");
    expect(result.missionText).toBe("We exist to do good things.");
    expect(result.programs).toEqual(["Reading Tutors"]);
  });
});

describe("isCooledDown", () => {
  const NOW = new Date("2026-05-14T12:00:00Z");

  it("returns false when status or attemptedAt is null", () => {
    expect(isCooledDown(null, null, false, NOW)).toBe(false);
    expect(isCooledDown("success", null, false, NOW)).toBe(false);
    expect(isCooledDown(null, NOW, false, NOW)).toBe(false);
  });

  it("treats success as permanent — always cooled down", () => {
    const longAgo = new Date("2025-01-01T00:00:00Z");
    expect(isCooledDown("success", longAgo, false, NOW)).toBe(true);
  });

  it("allows retry for no_website only when websiteChanged", () => {
    const recent = new Date(NOW.getTime() - 1000);
    expect(isCooledDown("no_website", recent, false, NOW)).toBe(true);
    expect(isCooledDown("no_website", recent, true, NOW)).toBe(false);
  });

  it("uses 24h cooldown for fetch_failed", () => {
    const just_now = new Date(NOW.getTime() - 1000);
    const two_days = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    expect(isCooledDown("fetch_failed", just_now, true, NOW)).toBe(true);
    expect(isCooledDown("fetch_failed", two_days, true, NOW)).toBe(false);
  });

  it("uses 7d cooldown for extract_failed", () => {
    const six_days = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    const eight_days = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(isCooledDown("extract_failed", six_days, true, NOW)).toBe(true);
    expect(isCooledDown("extract_failed", eight_days, true, NOW)).toBe(false);
  });

  it("uses 24h cooldown for cap_reached", () => {
    const just_now = new Date(NOW.getTime() - 1000);
    const two_days = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    expect(isCooledDown("cap_reached", just_now, true, NOW)).toBe(true);
    expect(isCooledDown("cap_reached", two_days, true, NOW)).toBe(false);
  });
});

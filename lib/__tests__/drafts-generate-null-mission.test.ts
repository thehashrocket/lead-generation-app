/**
 * CRITICAL REGRESSION TEST (mandated by /plan-eng-review):
 *
 * Before v0.4.0, draft generation worked with null missionText for orgs whose
 * 990 XML had nothing useful (or orgs with no cached mission). v0.4.0 adds an
 * inline website-enrichment pre-step. If anything about that path breaks the
 * existing fallback — null mission still produces a usable draft — outreach
 * to ~15-20% of orgs (those without a website) silently breaks.
 *
 * This test locks the v0.3.3.0 fallback: generateDraft({ missionText: null,
 * programs: undefined }) must still return { ok: true, subject, body }.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the cost-cap module — these tests focus on draft generation behavior,
// not cap mechanics. The cap path is exercised in cost-cap.test.ts.
vi.mock("@/lib/services/llm/cost-cap", () => ({
  reserveWithEstimate: vi.fn().mockResolvedValue({ kind: "allowed", reservation: 0.005 }),
  reconcileBudget: vi.fn().mockResolvedValue(undefined),
  recordFailedCost: vi.fn().mockResolvedValue(undefined),
  estimateCostUsd: vi.fn().mockReturnValue(0.005),
}));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  gateway: vi.fn((m: string) => m),
  generateText: (args: unknown) => mockGenerateText(args),
  Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
}));

import { generateDraft } from "@/lib/services/drafts/generate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateDraft — null mission regression", () => {
  it("returns ok:true with subject+body when missionText is null", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { subject: "Hello", body: "Hi — about volunteers at your org." },
      usage: { inputTokens: 800, outputTokens: 200 },
    });

    const result = await generateDraft({
      orgName: "Tiny Nonprofit",
      nteeCode: "P20",
      state: "OR",
      totalRevenue: "50000",
      missionText: null,
      programs: undefined,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subject).toBe("Hello");
      expect(result.body).toContain("volunteers");
    }
  });

  it("returns ok:true with empty programs array", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { subject: "Subject", body: "Body" },
      usage: { inputTokens: 800, outputTokens: 100 },
    });

    const result = await generateDraft({
      orgName: "Empty Programs Co",
      nteeCode: "B",
      state: "CA",
      missionText: null,
      programs: [],
    });

    expect(result.ok).toBe(true);
  });

  it("falls back to Haiku when Sonnet fails and still returns ok:true with null mission", async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error("sonnet down"))
      .mockResolvedValueOnce({
        output: { subject: "S", body: "B" },
        usage: { inputTokens: 100, outputTokens: 50 },
      });

    const result = await generateDraft({
      orgName: "Org",
      nteeCode: "D20",
      state: "TX",
      missionText: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe("anthropic/claude-haiku-4.5");
  });

  it("returns ok:false when both models fail (existing behavior preserved)", async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error("sonnet down"))
      .mockRejectedValueOnce(new Error("haiku down"));

    const result = await generateDraft({
      orgName: "Org",
      nteeCode: "D20",
      state: "TX",
      missionText: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/failed/i);
  });
});

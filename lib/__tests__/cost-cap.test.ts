import { describe, it, expect, vi, beforeEach } from "vitest";

// We intercept db.execute() to capture the SQL and simulate atomic responses.
// The real INSERT...ON CONFLICT WHERE-guard is what makes the cap atomic; we
// verify the call shapes and the higher-level helper behavior.
const executeMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    execute: (sql: unknown) => executeMock(sql),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => selectMock(),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({ usageLog: { day: "day", llmCostUsd: "llm_cost_usd" } }));

import {
  estimateCostUsd,
  reserveBudget,
  reconcileBudget,
  recordFailedCost,
  reserveWithEstimate,
  DAILY_HARD_CAP_USD,
} from "@/lib/services/llm/cost-cap";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateCostUsd", () => {
  it("uses Sonnet rates for sonnet model", () => {
    const cost = estimateCostUsd("anthropic/claude-sonnet-4.6", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    // $3 per 1M input tokens
    expect(cost).toBeCloseTo(3, 5);
  });

  it("uses Haiku rates for haiku model", () => {
    const cost = estimateCostUsd("anthropic/claude-haiku-4.5", {
      inputTokens: 0,
      outputTokens: 1_000_000,
    });
    // $5 per 1M output tokens
    expect(cost).toBeCloseTo(5, 5);
  });

  it("falls back to default (Sonnet) rates for unknown models", () => {
    const cost = estimateCostUsd("unknown/model", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(3, 5);
  });

  it("returns zero for zero tokens", () => {
    expect(estimateCostUsd("anthropic/claude-haiku-4.5", { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("reserveBudget — atomic check-and-reserve", () => {
  it("returns allowed:true with newCost when WHERE-guard passes", async () => {
    executeMock.mockResolvedValue({ rows: [{ llm_cost_usd: 1.5 }] });
    const result = await reserveBudget(0.5);
    expect(result).toEqual({ allowed: true, newCost: 1.5 });
  });

  it("returns allowed:false when WHERE-guard rejects (cap exceeded)", async () => {
    // No row returned = WHERE clause excluded the update = cap exceeded
    executeMock.mockResolvedValueOnce({ rows: [] });
    selectMock.mockResolvedValue([{ llmCostUsd: DAILY_HARD_CAP_USD - 0.01 }]);
    const result = await reserveBudget(1);
    expect(result.allowed).toBe(false);
    expect(result.newCost).toBeCloseTo(DAILY_HARD_CAP_USD - 0.01, 2);
  });

  it("calls db.execute exactly once when reservation succeeds", async () => {
    executeMock.mockResolvedValue({ rows: [{ llm_cost_usd: 0.01 }] });
    await reserveBudget(0.01);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileBudget", () => {
  it("issues an UPDATE when reservation and actual differ", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    await reconcileBudget(0.01, 0.005); // refund 0.005
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("skips the UPDATE when reservation equals actual", async () => {
    await reconcileBudget(0.01, 0.01);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("issues an UPDATE when actual exceeds reservation", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    await reconcileBudget(0.01, 0.02); // add 0.01
    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});

describe("recordFailedCost", () => {
  it("writes a failed-call cost so it counts toward the cap", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    await recordFailedCost("anthropic/claude-haiku-4.5", { inputTokens: 100, outputTokens: 50 });
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("skips the write when computed cost is zero", async () => {
    await recordFailedCost("anthropic/claude-haiku-4.5", { inputTokens: 0, outputTokens: 0 });
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("reserveWithEstimate", () => {
  it("returns allowed kind with reservation amount when budget fits", async () => {
    executeMock.mockResolvedValue({ rows: [{ llm_cost_usd: 0.01 }] });
    const result = await reserveWithEstimate("anthropic/claude-haiku-4.5", {
      inputTokens: 1000,
      outputTokens: 200,
    });
    expect(result.kind).toBe("allowed");
    if (result.kind === "allowed") {
      expect(result.reservation).toBeGreaterThan(0);
    }
  });

  it("returns cap_reached kind when WHERE-guard rejects", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    selectMock.mockResolvedValue([{ llmCostUsd: DAILY_HARD_CAP_USD }]);
    const result = await reserveWithEstimate("anthropic/claude-sonnet-4.6", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(result.kind).toBe("cap_reached");
    if (result.kind === "cap_reached") {
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    }
  });
});

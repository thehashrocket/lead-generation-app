import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({ apiTokens: {} }));

import { createApiToken, validateApiToken } from "@/lib/auth/tokens";

describe("createApiToken", () => {
  beforeEach(() => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "test-id" }]),
      }),
    });
  });

  it("sets expiresAt approximately 90 days from now", async () => {
    let capturedValues: Record<string, unknown> = {};
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedValues = vals;
        return { returning: vi.fn().mockResolvedValue([{ id: "test-id" }]) };
      }),
    });

    await createApiToken("test");

    expect(capturedValues.expiresAt).toBeInstanceOf(Date);
    const daysOut = ((capturedValues.expiresAt as Date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysOut).toBeGreaterThan(89);
    expect(daysOut).toBeLessThan(91);
  });

  it("returns a token string with the lgat_ prefix", async () => {
    const { token } = await createApiToken("test");
    expect(token).toMatch(/^lgat_[0-9a-f]{64}$/);
  });
});

describe("validateApiToken", () => {
  it("returns false when no matching non-expired token exists", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await validateApiToken("lgat_" + "a".repeat(64));
    expect(result).toBe(false);
  });

  it("returns true and updates lastUsedAt when token is valid and not expired", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "tok-1" }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await validateApiToken("lgat_" + "b".repeat(64));
    expect(result).toBe(true);
  });
});

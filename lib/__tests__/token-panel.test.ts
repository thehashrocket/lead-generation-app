import { describe, it, expect } from "vitest";

// daysUntilExpiry extracted from components/settings/token-panel.tsx
function daysUntilExpiry(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  return Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

describe("daysUntilExpiry", () => {
  it("returns null when expiresAt is null", () => {
    expect(daysUntilExpiry(null)).toBeNull();
  });

  it("returns ~90 for a token expiring 90 days from now", () => {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const days = daysUntilExpiry(future);
    expect(days).toBeGreaterThanOrEqual(89);
    expect(days).toBeLessThanOrEqual(90);
  });

  it("returns ≤10 for a token expiring in 10 days (red banner threshold)", () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const days = daysUntilExpiry(soon);
    expect(days).toBeLessThanOrEqual(10);
  });

  it("returns ≤80 for a token expiring in 79 days (amber banner threshold)", () => {
    const inRange = new Date(Date.now() + 79 * 24 * 60 * 60 * 1000);
    const days = daysUntilExpiry(inRange);
    expect(days).toBeLessThanOrEqual(80);
    expect(days).toBeGreaterThan(10);
  });

  it("returns negative for an already-expired token", () => {
    const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    expect(daysUntilExpiry(past)).toBeLessThan(0);
  });
});

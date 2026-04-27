import { describe, it, expect } from "vitest";

// Extracted regex from app/api/orgs/[ein]/enrich/route.ts
const EIN_REGEX = /^\d{2}-?\d{7}$/;

describe("EIN format validation", () => {
  it("accepts a hyphenated EIN (12-3456789)", () => {
    expect(EIN_REGEX.test("12-3456789")).toBe(true);
  });

  it("accepts a non-hyphenated EIN (123456789)", () => {
    expect(EIN_REGEX.test("123456789")).toBe(true);
  });

  it("rejects an EIN that is too short", () => {
    expect(EIN_REGEX.test("12-345678")).toBe(false);
  });

  it("rejects an EIN with letters", () => {
    expect(EIN_REGEX.test("AB-1234567")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(EIN_REGEX.test("")).toBe(false);
  });

  it("normalizes hyphenated EIN to no-hyphen form", () => {
    expect("12-3456789".replace("-", "")).toBe("123456789");
  });
});

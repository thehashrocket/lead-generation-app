import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnv = vi.hoisted(() => ({ HUNTER_API_KEY: "test-key" as string | undefined }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { lookupEmail, splitName } from "@/lib/services/contacts/email-lookup";

describe("splitName", () => {
  it("splits on first space", () => {
    expect(splitName("Jane Smith")).toEqual({ firstName: "Jane", lastName: "Smith" });
  });

  it("handles multi-word last name", () => {
    expect(splitName("Jane Van Der Berg")).toEqual({ firstName: "Jane", lastName: "Van Der Berg" });
  });

  it("returns single token as firstName when no space", () => {
    expect(splitName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
  });

  it("trims leading and trailing whitespace", () => {
    expect(splitName("  Jane Smith  ")).toEqual({ firstName: "Jane", lastName: "Smith" });
  });
});

describe("lookupEmail", () => {
  beforeEach(() => {
    mockEnv.HUNTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns null when HUNTER_API_KEY is absent", async () => {
    mockEnv.HUNTER_API_KEY = undefined;
    const result = await lookupEmail("example.org", "Jane", "Smith");
    expect(result).toBeNull();
  });

  it("returns null on non-ok HTTP response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    const result = await lookupEmail("example.org", "Jane", "Smith");
    expect(result).toBeNull();
  });

  it("returns null when data.email is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { email: null, score: 80 } }),
    } as Response);
    const result = await lookupEmail("example.org", "Jane", "Smith");
    expect(result).toBeNull();
  });

  it("returns null on fetch error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));
    const result = await lookupEmail("example.org", "Jane", "Smith");
    expect(result).toBeNull();
  });

  it("returns email and confidence on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { email: "jane@example.org", score: 72 } }),
    } as Response);
    const result = await lookupEmail("example.org", "Jane", "Smith");
    expect(result).toEqual({ email: "jane@example.org", confidence: 72 });
  });

  it("includes domain, first_name, last_name, and api_key in the request URL", async () => {
    let capturedUrl = "";
    vi.mocked(fetch).mockImplementationOnce(async (url: RequestInfo | URL) => {
      capturedUrl = url.toString();
      return { ok: true, json: async () => ({ data: { email: "jane@example.org", score: 80 } }) } as Response;
    });
    await lookupEmail("example.org", "Jane", "Smith");
    expect(capturedUrl).toContain("domain=example.org");
    expect(capturedUrl).toContain("first_name=Jane");
    expect(capturedUrl).toContain("last_name=Smith");
    expect(capturedUrl).toContain("api_key=test-key");
  });
});

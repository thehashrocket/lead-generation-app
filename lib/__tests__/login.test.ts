import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = vi.hoisted(() => ({ authenticated: false, save: vi.fn() }));

vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue(mockSession),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

import { POST } from "@/app/api/auth/login/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    process.env.APP_SECRET = "test-secret-that-is-long-enough-32chars";
    process.env.APP_PASSWORD = "correct-password";
    mockSession.authenticated = false;
    mockSession.save.mockClear();
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid");
  });

  it("returns 400 when password field is missing", async () => {
    const res = await POST(makeRequest({ notPassword: "oops" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid");
  });

  it("returns 401 when password is wrong", async () => {
    const res = await POST(makeRequest({ password: "wrong-password" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 200 and saves session when password is correct", async () => {
    const res = await POST(makeRequest({ password: "correct-password" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockSession.authenticated).toBe(true);
    expect(mockSession.save).toHaveBeenCalledOnce();
  });
});

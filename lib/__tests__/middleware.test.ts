import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

import { getIronSession } from "iron-session";
import { proxy, config } from "@/proxy";

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("proxy auth", () => {
  beforeEach(() => {
    process.env.APP_SECRET = "test-secret-that-is-long-enough-32chars";
  });

  it("passes through web route when session is authenticated", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ authenticated: true } as any);
    const res = await proxy(makeRequest("/search"));
    expect(res.status).toBe(200);
  });

  it("redirects to /login when session is missing", async () => {
    vi.mocked(getIronSession).mockResolvedValue({ authenticated: undefined } as any);
    const res = await proxy(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("/api/* routes pass through without session (extension bearer token auth)", async () => {
    const res = await proxy(makeRequest("/api/contacts"));
    expect(res.status).toBe(200);
  });

  it("/api/webhooks/* passes through without session (Svix signature auth)", async () => {
    const res = await proxy(makeRequest("/api/webhooks/resend/inbound"));
    expect(res.status).toBe(200);
  });

  it("/login passes through without session", async () => {
    const res = await proxy(makeRequest("/login"));
    expect(res.status).toBe(200);
  });
});

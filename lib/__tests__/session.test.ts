import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = vi.hoisted(() => ({ authenticated: false }));

vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockResolvedValue(mockSession),
}));

import { requireWebSession } from "@/lib/auth/session";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/test");
}

describe("requireWebSession", () => {
  it("returns 401 when session is not authenticated", async () => {
    mockSession.authenticated = false;
    const result = await requireWebSession(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns null when session is authenticated", async () => {
    mockSession.authenticated = true;
    const result = await requireWebSession(makeRequest());
    expect(result).toBeNull();
  });
});

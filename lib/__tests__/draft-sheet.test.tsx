// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

// Mock heavy UI dependencies so we can focus on DraftSheet logic
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/drafts/org-990-panel", () => ({
  Org990Panel: () => <div data-testid="org-990-panel" />,
}));
vi.mock("lucide-react", () => ({
  RefreshCw: () => <span data-testid="icon-refresh" />,
  Search: () => <span data-testid="icon-search" />,
  Send: () => <span data-testid="icon-send" />,
}));

// Stub base-ui Sheet to a simple div — we test logic, not the dialog chrome
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

import { DraftSheet } from "@/components/drafts/draft-sheet";
import type { SearchResultOrg } from "@/components/search/types";

const ORG: SearchResultOrg = {
  id: "org-1",
  ein: "12-3456789",
  name: "Test Org",
  nteeCode: "A01",
  state: "CA",
  totalRevenue: 100000,
  city: "Irvine",
  missionText: null,
  programs: [],
  namedContact: null,
};

const GENERATE_RESPONSE = {
  ok: true,
  draftId: "draft-1",
  subject: "Hello",
  body: "Body text",
  model: "claude-3",
  promptVersion: "v1",
  toEmail: "cfo@testorg.org",
  emailConfidence: 75,
};

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("DraftSheet — toEmail seeding", () => {
  it("seeds toEmail input from generate response when toEmail is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => GENERATE_RESPONSE,
      }),
    );

    render(<DraftSheet org={ORG} onClose={() => {}} hunterEnabled />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter recipient email") as HTMLInputElement;
      expect(input.value).toBe("cfo@testorg.org");
    });
  });

  it("leaves toEmail empty when generate response has no toEmail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...GENERATE_RESPONSE, toEmail: null, emailConfidence: null }),
      }),
    );

    render(<DraftSheet org={ORG} onClose={() => {}} hunterEnabled />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter recipient email") as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  it("shows confidence badge when email is seeded with confidence >= 50", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => GENERATE_RESPONSE,
      }),
    );

    render(<DraftSheet org={ORG} onClose={() => {}} hunterEnabled />);

    await waitFor(() => {
      expect(screen.getByText("75% confidence")).toBeInTheDocument();
    });
  });

  it("shows verify-before-sending badge when email confidence < 50", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...GENERATE_RESPONSE, toEmail: "cfo@testorg.org", emailConfidence: 40 }),
      }),
    );

    render(<DraftSheet org={ORG} onClose={() => {}} hunterEnabled />);

    await waitFor(() => {
      expect(screen.getByText("40% — verify before sending")).toBeInTheDocument();
    });
  });

  it("does not show Find email button when hunterEnabled is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...GENERATE_RESPONSE, toEmail: null, emailConfidence: null }),
      }),
    );

    render(<DraftSheet org={ORG} onClose={() => {}} hunterEnabled={false} />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter recipient email") as HTMLInputElement;
      expect(input.value).toBe("");
    });

    expect(screen.queryByRole("button", { name: /Find email/i })).not.toBeInTheDocument();
    expect(screen.getByText(/check org website or 990 PDF/)).toBeInTheDocument();
  });
});

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { SearchResultOrg } from "@/components/search/types";
import { Org990Panel } from "./org-990-panel";
import { RefreshCw, Search, Send } from "lucide-react";

type Props = {
  org: SearchResultOrg;
  onClose: () => void;
  hunterEnabled?: boolean;
};

type DraftState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; draftId: string; subject: string; body: string; model: string; promptVersion: string }
  | { status: "error"; message: string; reason?: "cap_reached" };

type SaveState = "saved" | "saving" | "failed" | "idle";

type HunterState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done" }
  | { status: "no_domain" }
  | { status: "not_found" }
  | { status: "quota_reached"; used: number; cap: number }
  | { status: "error" };

export function DraftSheet({ org, onClose, hunterEnabled = false }: Props) {
  const [draft, setDraft] = useState<DraftState>({ status: "idle" });
  const [toEmail, setToEmail] = useState("");
  const [emailConfidence, setEmailConfidence] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sending, setSending] = useState(false);
  const [hunter, setHunter] = useState<HunterState>({ status: "idle" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    generateDraft();
  }, [org.ein]);

  async function generateDraft() {
    setDraft({ status: "generating" });
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, ein: org.ein }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDraft({
          status: "error",
          message: data.error ?? "Draft generation failed.",
          reason: data.capReached ? "cap_reached" : undefined,
        });
        return;
      }
      setDraft({
        status: "ready",
        draftId: data.draftId,
        subject: data.subject,
        body: data.body,
        model: data.model,
        promptVersion: data.promptVersion,
      });
      setSubject(data.subject);
      setBody(data.body);
      if (data.toEmail) {
        setToEmail(data.toEmail);
        setEmailConfidence(data.emailConfidence ?? null);
      }
    } catch {
      setDraft({ status: "error", message: "Draft generation failed after 2 attempts." });
    }
  }

  const scheduleSave = useCallback(
    (newSubject: string, newBody: string) => {
      if (draft.status !== "ready") return;
      clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/drafts/${draft.draftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: newSubject, body: newBody }),
          });
          if (!res.ok) throw new Error("save failed");
          setSaveState("saved");
          setTimeout(() => setSaveState("idle"), 2000);
        } catch {
          setSaveState("failed");
        }
      }, 1000);
    },
    [draft],
  );

  function handleSubjectChange(val: string) {
    setSubject(val);
    scheduleSave(val, body);
  }

  function handleBodyChange(val: string) {
    setBody(val);
    scheduleSave(subject, val);
  }

  async function handleFindEmail() {
    setHunter({ status: "loading" });
    try {
      const res = await fetch(`/api/contacts/email-lookup?orgId=${encodeURIComponent(org.id)}`);
      const data = await res.json();

      if (res.status === 402) {
        setHunter({ status: "quota_reached", used: data.used ?? 50, cap: data.cap ?? 50 });
        return;
      }
      if (!res.ok) {
        setHunter({ status: "error" });
        return;
      }
      if (!data.email) {
        setHunter({ status: data.reason === "no_domain" ? "no_domain" : "not_found" });
        return;
      }
      setToEmail(data.email);
      setEmailConfidence(data.confidence ?? null);
      setHunter({ status: "done" });
    } catch {
      setHunter({ status: "error" });
    }
  }

  async function handleSend() {
    if (draft.status !== "ready") return;
    if (!toEmail) {
      toast.error("Enter a recipient email before sending.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/sends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.draftId, toEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason =
          res.status === 401 ? "Gmail reconnect needed"
          : res.status === 429 ? "Rate limited, wait 1 min"
          : data.error ?? "Send error";
        toast.error(`Send failed — ${reason}. Draft saved.`);
        return;
      }
      toast.success("Sent! Email moved to Sent view.");
      setTimeout(() => {
        onClose();
        window.location.href = "/sent";
      }, 2000);
    } finally {
      setSending(false);
    }
  }

  const isCapReached = draft.status === "error" && draft.reason === "cap_reached";
  const showHunterButton =
    hunterEnabled && !toEmail && hunter.status !== "quota_reached";

  return (
    <Sheet open onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent side="right" className="flex w-[60vw] max-w-none flex-col p-0">
        <SheetHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <SheetTitle className="text-lg font-bold">{org.name}</SheetTitle>
            {org.nteeCode && (
              <Badge variant="outline" className="text-xs">
                {org.nteeCode}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: org context */}
          <div className="flex w-[45%] flex-col gap-4 overflow-auto border-r p-6">
            <Org990Panel org={org} />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">To:</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter recipient email"
                  value={toEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setToEmail(e.target.value);
                    setEmailConfidence(null);
                  }}
                  className="h-8 text-sm"
                />
                {showHunterButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={handleFindEmail}
                    disabled={hunter.status === "loading"}
                  >
                    {hunter.status === "loading" ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    Find email
                  </Button>
                )}
              </div>

              {toEmail && emailConfidence !== null && (
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={
                      emailConfidence >= 50
                        ? "border-green-300 text-green-700 text-xs"
                        : "border-amber-300 text-amber-700 text-xs"
                    }
                  >
                    {emailConfidence >= 50
                      ? `${emailConfidence}% confidence`
                      : `${emailConfidence}% — verify before sending`}
                  </Badge>
                </div>
              )}

              {hunter.status === "no_domain" && (
                <p className="text-xs text-gray-400">No domain found for this org.</p>
              )}
              {hunter.status === "not_found" && (
                <p className="text-xs text-gray-400">Email not found by Hunter.io.</p>
              )}
              {hunter.status === "quota_reached" && (
                <p className="text-xs text-amber-600">
                  Monthly Hunter.io limit reached ({hunter.used}/{hunter.cap}).
                </p>
              )}
              {hunter.status === "error" && (
                <p className="text-xs text-red-500">Hunter.io lookup failed.</p>
              )}

              {!toEmail && hunter.status === "idle" && (
                <p className="text-xs text-gray-400">
                  {hunterEnabled
                    ? "Email not found via extension — click Find email or enter manually."
                    : "Email not found via extension — check org website or 990 PDF."}
                </p>
              )}
            </div>
          </div>

          {/* Right: draft editor */}
          <div className="flex w-[55%] flex-col p-6">
            {draft.status === "generating" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <div className="space-y-2 w-full">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-4 animate-pulse rounded bg-gray-200"
                      style={{ width: `${70 + (i % 3) * 10}%` }}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-400">Generating personalized draft...</p>
              </div>
            )}

            {draft.status === "error" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{draft.message}</p>
                {!isCapReached && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={generateDraft}>
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDraft({ status: "idle" });
                        setSubject("");
                        setBody("");
                      }}
                    >
                      Edit manually
                    </Button>
                  </div>
                )}
              </div>
            )}

            {(draft.status === "ready" || draft.status === "idle") && (
              <div className="flex flex-1 flex-col gap-3">
                <Input
                  placeholder="Subject line"
                  value={subject}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSubjectChange(e.target.value)}
                  className="text-sm font-medium"
                />
                <Textarea
                  placeholder="Email body — edit before sending"
                  value={body}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleBodyChange(e.target.value)}
                  className="flex-1 resize-none text-[15px] leading-relaxed"
                  rows={16}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <span className="text-xs text-gray-400">
            {saveState === "saving" && "Saving..."}
            {saveState === "saved" && "Saved ✓"}
            {saveState === "failed" && (
              <span className="text-red-500">Save failed — check connection</span>
            )}
          </span>

          <div className="flex items-center gap-2">
            {draft.status === "ready" && (
              <span className="text-xs text-gray-400">{draft.model}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={generateDraft}
              disabled={draft.status === "generating"}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || draft.status === "generating" || !toEmail || isCapReached}
              className="gap-1.5"
            >
              {sending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : isCapReached ? (
                "Weekly cap reached — resets Monday"
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send via Resend
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

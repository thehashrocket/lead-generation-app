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
import { RefreshCw, Send } from "lucide-react";

type Props = {
  org: SearchResultOrg;
  onClose: () => void;
};

type DraftState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; draftId: string; subject: string; body: string; model: string; promptVersion: string }
  | { status: "error"; message: string };

type SaveState = "saved" | "saving" | "failed" | "idle";

export function DraftSheet({ org, onClose }: Props) {
  const [draft, setDraft] = useState<DraftState>({ status: "idle" });
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sending, setSending] = useState(false);
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
        setDraft({ status: "error", message: data.error ?? "Draft generation failed." });
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

  const isCapReached = draft.status === "error" && draft.message.includes("cap");

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
              <Input
                placeholder="Enter recipient email"
                value={toEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToEmail(e.target.value)}
                className="h-8 text-sm"
              />
              {!toEmail && (
                <p className="text-xs text-gray-400">
                  Email not found via extension — check org website or 990 PDF.
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

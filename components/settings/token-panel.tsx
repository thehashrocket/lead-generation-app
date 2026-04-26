"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";

type Props = {
  token: { id: string; name: string; createdAt: Date | null; lastUsedAt: Date | null } | null;
};

export function TokenPanel({ token: initialToken }: Props) {
  const [token, setToken] = useState(initialToken);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    if (!confirm("Regenerate token? The old token will stop working immediately.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings/token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewTokenValue(data.token);
      setToken(data.tokenMeta);
    } catch {
      toast.error("Failed to regenerate token");
    } finally {
      setLoading(false);
    }
  }

  function copy(val: string) {
    navigator.clipboard.writeText(val);
    toast.success("Copied to clipboard");
  }

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">API Token (Chrome Extension)</h2>
      {token ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{token.name}</span> — created{" "}
            {token.createdAt?.toLocaleDateString()}
            {token.lastUsedAt && `, last used ${token.lastUsedAt.toLocaleDateString()}`}
          </p>
          {newTokenValue && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800 mb-2 font-medium">
                Copy this token now — it won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-white border rounded px-2 py-1 flex-1 truncate">
                  {newTokenValue}
                </code>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(newTokenValue)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-amber-700 mt-2">
                Paste this token into the Chrome extension popup.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No token generated yet.</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 gap-1.5"
        onClick={regenerate}
        disabled={loading}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {token ? "Regenerate token" : "Generate token"}
      </Button>
    </div>
  );
}

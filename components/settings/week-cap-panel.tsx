"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const WEEKLY_CAP = 50;

export function WeekCapPanel({ weekCount: initial }: { weekCount: number }) {
  const [count, setCount] = useState(initial);
  const [loading, setLoading] = useState(false);

  const color =
    count >= WEEKLY_CAP ? "text-red-600" : count >= 45 ? "text-amber-600" : "text-gray-700";

  async function reset() {
    if (!confirm("Reset the weekly send count? For testing only.")) return;
    setLoading(true);
    try {
      await fetch("/api/settings/reset-cap", { method: "POST" });
      setCount(0);
      toast.success("Weekly cap reset");
    } catch {
      toast.error("Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">Weekly Send Cap</h2>
      <p className={cn("text-sm font-medium", color)}>
        {count}/{WEEKLY_CAP} emails sent this week
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={reset} disabled={loading}>
        Reset manually (testing)
      </Button>
    </div>
  );
}

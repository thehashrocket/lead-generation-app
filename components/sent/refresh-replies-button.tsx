"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshRepliesButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      {refreshing ? "Refreshing…" : "Refresh Replies"}
    </Button>
  );
}

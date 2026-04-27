import { db } from "@/lib/db";
import { apiTokens, drafts, replies, sends, usageLog } from "@/lib/db/schema";
import { createApiToken, revokeAllTokens } from "@/lib/auth/tokens";
import { getWeeklySendCount } from "@/lib/services/sends/resend";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { eq, count, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { HealthPanel } from "@/components/settings/health-panel";
import { TokenPanel } from "@/components/settings/token-panel";
import { PromptPerfPanel } from "@/components/settings/prompt-perf-panel";
import { WeekCapPanel } from "@/components/settings/week-cap-panel";

export const dynamic = "force-dynamic";

async function getPromptPerf() {
  const rows = await db.execute<{
    prompt_version: string;
    sends: number;
    replies: number;
  }>(
    `SELECT d.prompt_version,
            COUNT(s.id)::int AS sends,
            COUNT(r.id)::int AS replies
     FROM drafts d
     LEFT JOIN sends s ON s.draft_id = d.id
     LEFT JOIN replies r ON r.send_id = s.id AND r.classification = 'human'
     GROUP BY d.prompt_version
     ORDER BY d.prompt_version`,
  );
  return rows.rows ?? [];
}

async function getToken() {
  const [token] = await db
    .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, expiresAt: apiTokens.expiresAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .orderBy(desc(apiTokens.createdAt))
    .limit(1);
  return token ?? null;
}

export default async function SettingsPage() {
  const [promptPerf, token, weekCount] = await Promise.all([
    getPromptPerf(),
    getToken(),
    getWeeklySendCount(),
  ]);

  return (
    <div className="max-w-2xl p-6 space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      <HealthPanel />
      <Separator />

      <TokenPanel token={token} />
      <Separator />

      <WeekCapPanel weekCount={weekCount} />
      <Separator />

      <PromptPerfPanel rows={promptPerf} />
    </div>
  );
}

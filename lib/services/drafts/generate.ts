import { db } from "@/lib/db";
import { drafts, usageLog } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { generateText, Output, gateway } from "ai";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const PROMPT_VERSION = "v1";
const LLM_MODEL = "anthropic/claude-sonnet-4.6";
const LLM_FALLBACK = "anthropic/claude-haiku-4.5";
const DAILY_SOFT_CAP_USD = 5;
const DAILY_HARD_CAP_USD = 25;

const draftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

type OrgContext = {
  orgName: string;
  nteeCode?: string | null;
  state?: string | null;
  totalRevenue?: string | null;
  missionText?: string | null;
  programs?: string[];
  namedContact?: { name: string; title: string } | null;
};

type GenerateResult =
  | { ok: true; subject: string; body: string; model: string }
  | { ok: false; error: string; capReached?: boolean };

export async function generateDraft(orgCtx: OrgContext): Promise<GenerateResult> {
  const capCheck = await checkDailyCap();
  if (capCheck.hardCapReached) {
    return { ok: false, error: "Daily LLM cap reached, resets at midnight UTC.", capReached: true };
  }

  const systemPrompt = buildSystemPrompt();
  const safeCtx = {
    ...orgCtx,
    missionText: orgCtx.missionText?.slice(0, 500) ?? null,
    programs: orgCtx.programs?.slice(0, 5),
  };
  const userContent = JSON.stringify(safeCtx);

  let result: Awaited<ReturnType<typeof generateText>>;
  let model = LLM_MODEL;

  try {
    result = await generateText({
      model: gateway(model),
      output: Output.object({ schema: draftSchema }),
      system: systemPrompt,
      prompt: userContent,
    });
  } catch {
    model = LLM_FALLBACK;
    try {
      result = await generateText({
        model: gateway(model),
        output: Output.object({ schema: draftSchema }),
        system: systemPrompt,
        prompt: userContent,
      });
    } catch (err) {
      return { ok: false, error: "Draft generation failed after 2 attempts." };
    }
  }

  const output = (result as any).output as { subject: string; body: string };
  if (!output?.subject || !output?.body) {
    return { ok: false, error: "Draft generation failed after 2 attempts." };
  }

  await trackUsage();

  return { ok: true, subject: output.subject, body: output.body, model };
}

function buildSystemPrompt(): string {
  return `You are helping Jason draft a personalized cold email to a non-profit about his volunteer match app, VolunteerReady. Tone: warm, specific, low-pressure, no marketing hype. Length: 3 short paragraphs. Open by naming something specific about the org (use mission_text if available, otherwise NTEE category + state). Middle paragraph: one concrete way VolunteerReady could help with a problem orgs of this shape commonly have. Close with: a soft ask for a 15-minute conversation. Sign off as Jason. Do NOT use "I hope this email finds you well," any superlatives, or any em dashes.

Output JSON with exactly two keys: { "subject": "...", "body": "..." }`;
}

async function checkDailyCap(): Promise<{ hardCapReached: boolean; softCapReached: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.select().from(usageLog).where(eq(usageLog.day, today)).limit(1);
  const cost = row?.llmCostUsd ?? 0;
  return {
    hardCapReached: cost >= DAILY_HARD_CAP_USD,
    softCapReached: cost >= DAILY_SOFT_CAP_USD,
  };
}

async function trackUsage(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const estimatedCost = 0.003;
  await db
    .insert(usageLog)
    .values({ day: today, llmCalls: 1, llmCostUsd: estimatedCost })
    .onConflictDoUpdate({
      target: usageLog.day,
      set: {
        llmCalls: sql`${usageLog.llmCalls} + 1`,
        llmCostUsd: sql`${usageLog.llmCostUsd} + ${estimatedCost}`,
      },
    });
}

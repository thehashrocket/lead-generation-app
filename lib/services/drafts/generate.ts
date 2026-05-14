import { generateText, Output, gateway } from "ai";
import { z } from "zod";
import {
  estimateCostUsd,
  reconcileBudget,
  recordFailedCost,
  reserveWithEstimate,
} from "@/lib/services/llm/cost-cap";

const PROMPT_VERSION = "v1";
const LLM_MODEL = "anthropic/claude-sonnet-4.6";
const LLM_FALLBACK = "anthropic/claude-haiku-4.5";

// Upper-bound token estimate for budget reservation. Real usage is reconciled after.
const PRIMARY_TOKEN_ESTIMATE = { inputTokens: 1500, outputTokens: 600 };

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
  const systemPrompt = buildSystemPrompt();
  const safeCtx = {
    ...orgCtx,
    missionText: orgCtx.missionText?.slice(0, 500) ?? null,
    programs: orgCtx.programs?.slice(0, 5),
  };
  const userContent = JSON.stringify(safeCtx);

  // Pre-flight reservation. If even the primary call won't fit under the cap,
  // bail before we burn any cost. Two concurrent calls can't both pass this gate.
  const reservation = await reserveWithEstimate(LLM_MODEL, PRIMARY_TOKEN_ESTIMATE);
  if (reservation.kind === "cap_reached") {
    return { ok: false, error: "Daily LLM cap reached, resets at midnight UTC.", capReached: true };
  }

  let result: Awaited<ReturnType<typeof generateText>> | null = null;
  let model = LLM_MODEL;
  let primaryFailed = false;

  try {
    result = await generateText({
      model: gateway(model),
      output: Output.object({ schema: draftSchema }),
      system: systemPrompt,
      prompt: userContent,
    });
  } catch {
    primaryFailed = true;
    // Primary failed — record the worst-case cost so failures count toward the cap.
    await recordFailedCost(model, PRIMARY_TOKEN_ESTIMATE);
    // Refund the original reservation since we're going to make a separate
    // reconciliation for the actual outcome (success-on-fallback or fallback-failure).
    await reconcileBudget(reservation.reservation, 0);

    model = LLM_FALLBACK;
    const fallbackReservation = await reserveWithEstimate(model, PRIMARY_TOKEN_ESTIMATE);
    if (fallbackReservation.kind === "cap_reached") {
      return { ok: false, error: "Daily LLM cap reached, resets at midnight UTC.", capReached: true };
    }
    try {
      result = await generateText({
        model: gateway(model),
        output: Output.object({ schema: draftSchema }),
        system: systemPrompt,
        prompt: userContent,
      });
      // Success on fallback — reconcile from estimate to actual.
      const actual = readUsage(result);
      await reconcileBudget(fallbackReservation.reservation, estimateCostUsd(model, actual));
    } catch {
      await recordFailedCost(model, PRIMARY_TOKEN_ESTIMATE);
      await reconcileBudget(fallbackReservation.reservation, 0);
      return { ok: false, error: "Draft generation failed after 2 attempts." };
    }
  }

  if (!result) {
    return { ok: false, error: "Draft generation failed after 2 attempts." };
  }

  // If we got here without primaryFailed, reconcile the primary reservation now.
  if (!primaryFailed) {
    const actual = readUsage(result);
    await reconcileBudget(reservation.reservation, estimateCostUsd(model, actual));
  }

  const output = (result as { output?: { subject?: string; body?: string } }).output;
  if (!output?.subject || !output?.body) {
    return { ok: false, error: "Draft generation failed after 2 attempts." };
  }

  return { ok: true, subject: output.subject, body: output.body, model };
}

function readUsage(result: Awaited<ReturnType<typeof generateText>>): { inputTokens: number; outputTokens: number } {
  const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
  return {
    inputTokens: usage?.inputTokens ?? PRIMARY_TOKEN_ESTIMATE.inputTokens,
    outputTokens: usage?.outputTokens ?? PRIMARY_TOKEN_ESTIMATE.outputTokens,
  };
}

function buildSystemPrompt(): string {
  return `You are helping Jason draft a personalized cold email to a non-profit about his volunteer match app, VolunteerReady. Tone: warm, specific, low-pressure, no marketing hype. Length: 3 short paragraphs. Open by naming something specific about the org (use mission_text if available, otherwise NTEE category + state). Middle paragraph: one concrete way VolunteerReady could help with a problem orgs of this shape commonly have. Close with: a soft ask for a 15-minute conversation. Sign off as Jason. Do NOT use "I hope this email finds you well," any superlatives, or any em dashes.

Output JSON with exactly two keys: { "subject": "...", "body": "..." }`;
}

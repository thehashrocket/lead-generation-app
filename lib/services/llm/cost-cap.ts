import { db } from "@/lib/db";
import { usageLog } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const DAILY_SOFT_CAP_USD = 5;
export const DAILY_HARD_CAP_USD = 25;

// USD per 1M tokens. Conservative public-rate-card estimates; gateway may bill
// slightly less. Update when adding new models.
const RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "anthropic/claude-sonnet-4.6": { inputPerM: 3, outputPerM: 15 },
  "anthropic/claude-haiku-4.5": { inputPerM: 1, outputPerM: 5 },
};

const DEFAULT_RATE = { inputPerM: 3, outputPerM: 15 };

export type Usage = { inputTokens: number; outputTokens: number };

export function estimateCostUsd(model: string, usage: Usage): number {
  const rate = RATES[model] ?? DEFAULT_RATE;
  return (
    (usage.inputTokens * rate.inputPerM) / 1_000_000 +
    (usage.outputTokens * rate.outputPerM) / 1_000_000
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Returns the day's accumulated cost. Read-only.
export async function readDailyCost(): Promise<number> {
  const [row] = await db
    .select()
    .from(usageLog)
    .where(sql`${usageLog.day} = ${today()}`)
    .limit(1);
  return row?.llmCostUsd ?? 0;
}

// Atomic check-and-reserve: returns { allowed: true, newCost } if cost+reservation
// still fits under the hard cap, else { allowed: false }.
// Uses INSERT...ON CONFLICT DO UPDATE...WHERE so two concurrent callers can't both
// pass the cap. The DB enforces the cap, not a read-then-act pattern.
//
// The cap check appears in BOTH the INSERT and UPDATE branches because the WHERE on
// the DO UPDATE only fires when a row already exists; without an explicit INSERT-side
// guard, a single reservation > $25 on the first call of the day would land unchecked.
// Today the largest reservation is ~$0.014 so the practical risk is bounded, but the
// contract should hold for any reservation amount.
export async function reserveBudget(reservedUsd: number): Promise<{ allowed: boolean; newCost: number }> {
  if (reservedUsd > DAILY_HARD_CAP_USD) {
    return { allowed: false, newCost: await readDailyCost() };
  }
  const day = today();
  const id = crypto.randomUUID();
  const result = await db.execute<{ llm_cost_usd: number }>(sql`
    INSERT INTO usage_log (id, day, llm_cost_usd, llm_calls)
    VALUES (${id}, ${day}, ${reservedUsd}, 1)
    ON CONFLICT (day) DO UPDATE
      SET llm_cost_usd = usage_log.llm_cost_usd + ${reservedUsd},
          llm_calls = usage_log.llm_calls + 1
      WHERE usage_log.llm_cost_usd + ${reservedUsd} <= ${DAILY_HARD_CAP_USD}
    RETURNING llm_cost_usd
  `);
  const row = result.rows?.[0];
  if (!row) {
    return { allowed: false, newCost: await readDailyCost() };
  }
  return { allowed: true, newCost: row.llm_cost_usd };
}

// Adjusts the previously-reserved amount once the actual cost is known. If the
// real cost was less than the reservation, refund the difference; if more, add
// the delta. Never makes the cap mutate retroactively (i.e. doesn't fail).
export async function reconcileBudget(reservedUsd: number, actualUsd: number): Promise<void> {
  const delta = actualUsd - reservedUsd;
  if (delta === 0) return;
  const day = today();
  await db.execute(sql`
    UPDATE usage_log
    SET llm_cost_usd = GREATEST(0, llm_cost_usd + ${delta})
    WHERE day = ${day}
  `);
}

// Records a failed-call cost (no successful output) so failures count toward the cap.
// This is the path the original checkDailyCap+trackUsage missed — failed primary
// attempts and timeouts burned real gateway dollars but were invisible.
export async function recordFailedCost(model: string, usage: Usage): Promise<void> {
  const cost = estimateCostUsd(model, usage);
  if (cost <= 0) return;
  const day = today();
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO usage_log (id, day, llm_cost_usd, llm_calls)
    VALUES (${id}, ${day}, ${cost}, 1)
    ON CONFLICT (day) DO UPDATE
      SET llm_cost_usd = usage_log.llm_cost_usd + ${cost},
          llm_calls = usage_log.llm_calls + 1
  `);
}

export type CapResult =
  | { kind: "allowed"; reservation: number }
  | { kind: "cap_reached"; remaining: number };

// Standard entry point for callers. Reserves an upper-bound estimate; caller
// must reconcile via reconcileBudget() once usage is known. If reservation would
// exceed the cap, returns cap_reached and writes nothing.
export async function reserveWithEstimate(model: string, estimatedUsage: Usage): Promise<CapResult> {
  const estimate = estimateCostUsd(model, estimatedUsage);
  const result = await reserveBudget(estimate);
  if (!result.allowed) {
    return { kind: "cap_reached", remaining: Math.max(0, DAILY_HARD_CAP_USD - result.newCost) };
  }
  return { kind: "allowed", reservation: estimate };
}

import { integer, pgTable, real, text, unique } from "drizzle-orm/pg-core";

export const usageLog = pgTable("usage_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  day: text("day").notNull().unique(),
  llmCalls: integer("llm_calls").notNull().default(0),
  llmCostUsd: real("llm_cost_usd").notNull().default(0),
  hunterCalls: integer("hunter_calls").notNull().default(0),
});

export type UsageLog = typeof usageLog.$inferSelect;

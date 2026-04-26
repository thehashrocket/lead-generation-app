import { pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const suppressionReasonEnum = pgEnum("suppression_reason", [
  "bounced",
  "complained",
  "unsubscribed",
]);

export const suppressionSourceEnum = pgEnum("suppression_source", ["webhook", "manual"]);

export const suppressions = pgTable("suppressions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email"),
  domain: text("domain"),
  reason: suppressionReasonEnum("reason").notNull(),
  source: suppressionSourceEnum("source").notNull().default("webhook"),
  suppressedAt: timestamp("suppressed_at").defaultNow().notNull(),
});

export type Suppression = typeof suppressions.$inferSelect;
export type NewSuppression = typeof suppressions.$inferInsert;

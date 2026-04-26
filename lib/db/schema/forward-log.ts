import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sends } from "./sends";

export const blockReasonEnum = pgEnum("block_reason", [
  "header",
  "count_cap",
  "own_domain",
  "circuit_breaker",
]);

export const forwardLog = pgTable("forward_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sendId: text("send_id")
    .notNull()
    .references(() => sends.id),
  forwardedAt: timestamp("forwarded_at").defaultNow().notNull(),
  blocked: boolean("blocked").notNull().default(false),
  blockReason: blockReasonEnum("block_reason"),
});

export type ForwardLog = typeof forwardLog.$inferSelect;

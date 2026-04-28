import { pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { drafts } from "./drafts";

export const sendStatusEnum = pgEnum("send_status", [
  "queued",
  "delivered",
  "bounced",
  "complained",
  "failed",
]);

export const sends = pgTable("sends", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  draftId: text("draft_id")
    .notNull()
    .references(() => drafts.id),
  resendMessageId: text("resend_message_id").unique(),
  verpToken: text("verp_token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  idempotencyKey: text("idempotency_key").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  status: sendStatusEnum("status").notNull().default("queued"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  bouncedAt: timestamp("bounced_at"),
  complainedAt: timestamp("complained_at"),
  messageId: text("message_id"),
  inReplyTo: text("in_reply_to"),
  references: text("references"),
});

export type Send = typeof sends.$inferSelect;
export type NewSend = typeof sends.$inferInsert;

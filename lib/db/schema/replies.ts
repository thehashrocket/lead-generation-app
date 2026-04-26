import { pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sends } from "./sends";

export const replyClassificationEnum = pgEnum("reply_classification", [
  "human",
  "ooo",
  "dsn",
  "autoresponder",
  "bulk",
  "unknown",
]);

export const replies = pgTable("replies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sendId: text("send_id")
    .notNull()
    .references(() => sends.id),
  resendInboundId: text("resend_inbound_id").notNull().unique(),
  classification: replyClassificationEnum("classification").notNull().default("unknown"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  snippet: text("snippet"),
  messageId: text("message_id"),
  inReplyTo: text("in_reply_to"),
  references: text("references"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});

export type Reply = typeof replies.$inferSelect;
export type NewReply = typeof replies.$inferInsert;

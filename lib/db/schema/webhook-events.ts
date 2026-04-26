import { boolean, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  signatureVerified: boolean("signature_verified").notNull().default(false),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;

import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  resendApiKeyStatus: text("resend_api_key_status"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Settings = typeof settings.$inferSelect;

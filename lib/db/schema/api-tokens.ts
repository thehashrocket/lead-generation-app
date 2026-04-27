import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  lastUsedIp: text("last_used_ip"),
  lastUsedUserAgent: text("last_used_user_agent"),
});

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

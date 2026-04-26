import { index, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

export const orgs = pgTable(
  "orgs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ein: varchar("ein", { length: 20 }).notNull(),
    name: text("name").notNull(),
    nteeCode: varchar("ntee_code", { length: 10 }),
    state: varchar("state", { length: 2 }),
    totalRevenue: text("total_revenue"),
    propublicaUrl: text("propublica_url"),
    missionText: text("mission_text"),
    programsJson: text("programs_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    enrichedAt: timestamp("enriched_at"),
    cachedAt: timestamp("cached_at"),
  },
  (t) => [unique().on(t.ein)],
);

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;

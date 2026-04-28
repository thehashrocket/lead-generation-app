import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const irsFilingIndex = pgTable(
  "irs_filing_index",
  {
    objectId: text("object_id").primaryKey(),
    ein: text("ein").notNull(),
    taxPeriod: text("tax_period"),
    formType: text("form_type"),
    orgName: text("org_name"),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [index("irs_filing_index_ein_idx").on(t.ein)],
);

export type IrsFilingIndex = typeof irsFilingIndex.$inferSelect;

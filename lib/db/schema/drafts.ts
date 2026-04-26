import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { orgs } from "./orgs";

export const drafts = pgTable(
  "drafts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    contactId: text("contact_id").references(() => contacts.id),
    toEmail: text("to_email"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("drafts_org_id_idx").on(t.orgId)],
);

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;

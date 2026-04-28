import { sql } from "drizzle-orm";
import { boolean, index, pgTable, smallint, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").references(() => orgs.id),
    name: text("name").notNull(),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    emailConfidence: smallint("email_confidence"),
    repliedAt: timestamp("replied_at"),
    doNotContact: boolean("do_not_contact").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("contacts_org_id_idx").on(t.orgId),
    unique().on(t.linkedinUrl),
    uniqueIndex("contacts_stub_org_unique_idx").on(t.orgId).where(sql`${t.linkedinUrl} IS NULL`),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

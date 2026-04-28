ALTER TABLE "orgs" ADD COLUMN "website" text;
ALTER TABLE "contacts" ADD COLUMN "email_confidence" smallint;
ALTER TABLE "usage_log" ADD COLUMN "hunter_calls" integer DEFAULT 0;
CREATE UNIQUE INDEX "contacts_stub_org_unique_idx" ON "contacts" ("org_id") WHERE "linkedin_url" IS NULL;

ALTER TABLE "orgs" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "total_expenses" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "num_employees" integer;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_confidence" smallint;--> statement-breakpoint
ALTER TABLE "usage_log" ADD COLUMN "hunter_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_stub_org_unique_idx" ON "contacts" USING btree ("org_id") WHERE "contacts"."linkedin_url" IS NULL;
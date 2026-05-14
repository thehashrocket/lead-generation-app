CREATE TYPE "public"."mission_enrichment_status" AS ENUM('success', 'no_website', 'fetch_failed', 'extract_failed', 'cap_reached');--> statement-breakpoint
CREATE TYPE "public"."mission_source" AS ENUM('990_xml', 'website_scrape');--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "mission_source" "mission_source";--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "mission_enrichment_status" "mission_enrichment_status";--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "mission_enrichment_attempted_at" timestamp;--> statement-breakpoint
-- Backfill: any pre-existing mission_text was populated by the old 990 XML path.
-- Mark it as such so the new website scrape can never overwrite it.
UPDATE "orgs" SET "mission_source" = '990_xml', "mission_enrichment_status" = 'success'
WHERE "mission_text" IS NOT NULL AND "mission_source" IS NULL;
CREATE TABLE "irs_filing_index" (
	"object_id" text PRIMARY KEY NOT NULL,
	"ein" text NOT NULL,
	"tax_period" text,
	"form_type" text,
	"org_name" text,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "irs_filing_index_ein_idx" ON "irs_filing_index" USING btree ("ein");
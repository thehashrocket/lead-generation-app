CREATE TYPE "public"."send_status" AS ENUM('queued', 'delivered', 'bounced', 'complained');--> statement-breakpoint
CREATE TYPE "public"."reply_classification" AS ENUM('human', 'ooo', 'dsn', 'autoresponder', 'bulk', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('bounced', 'complained', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."suppression_source" AS ENUM('webhook', 'manual');--> statement-breakpoint
CREATE TYPE "public"."block_reason" AS ENUM('header', 'count_cap', 'own_domain', 'circuit_breaker');--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"ein" varchar(20) NOT NULL,
	"name" text NOT NULL,
	"ntee_code" varchar(10),
	"state" varchar(2),
	"total_revenue" text,
	"propublica_url" text,
	"mission_text" text,
	"programs_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"enriched_at" timestamp,
	"cached_at" timestamp,
	CONSTRAINT "orgs_ein_unique" UNIQUE("ein")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"title" text,
	"linkedin_url" text,
	"email" text,
	"replied_at" timestamp,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_linkedin_url_unique" UNIQUE("linkedin_url")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text,
	"to_email" text,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sends" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"resend_message_id" text,
	"verp_token" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "send_status" DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"bounced_at" timestamp,
	"complained_at" timestamp,
	"message_id" text,
	"in_reply_to" text,
	"references" text,
	CONSTRAINT "sends_resend_message_id_unique" UNIQUE("resend_message_id"),
	CONSTRAINT "sends_verp_token_unique" UNIQUE("verp_token"),
	CONSTRAINT "sends_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" text PRIMARY KEY NOT NULL,
	"send_id" text NOT NULL,
	"resend_inbound_id" text NOT NULL,
	"classification" "reply_classification" DEFAULT 'unknown' NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"body_text" text,
	"body_html" text,
	"snippet" text,
	"message_id" text,
	"in_reply_to" text,
	"references" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "replies_resend_inbound_id_unique" UNIQUE("resend_inbound_id")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_used_ip" text,
	"last_used_user_agent" text,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"resend_api_key_status" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"domain" text,
	"reason" "suppression_reason" NOT NULL,
	"source" "suppression_source" DEFAULT 'webhook' NOT NULL,
	"suppressed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"signature_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "forward_log" (
	"id" text PRIMARY KEY NOT NULL,
	"send_id" text NOT NULL,
	"forwarded_at" timestamp DEFAULT now() NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"block_reason" "block_reason"
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	"llm_cost_usd" real DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_log_day_unique" UNIQUE("day")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_send_id_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."sends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward_log" ADD CONSTRAINT "forward_log_send_id_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."sends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_org_id_idx" ON "contacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "drafts_org_id_idx" ON "drafts" USING btree ("org_id");